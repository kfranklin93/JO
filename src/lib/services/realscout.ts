/**
 * Typed client for the RealScout agent API.
 *
 * Base `https://www.realscout.com/api/agent/v1`, bearer auth from
 * `REALSCOUT_API_TOKEN`. Everything that talks to RealScout goes through
 * {@link realScoutRequest} here, so authentication, rate-limit handling and
 * error classification exist once.
 *
 * ## The token is never readable, printable or returnable
 *
 * `REALSCOUT_API_TOKEN` is secret-scoped in Netlify, so nobody can read it
 * locally and nothing here may put it where it could be read: it is not logged,
 * not interpolated into an error message, and not echoed in any response shape
 * this module produces. The only thing callers learn about it is whether it is
 * present ({@link realScoutConfigured}) and whether RealScout accepted it
 * ({@link probeRealScout}).
 *
 * ## Errors are classified, not stringified
 *
 * A caller has to act differently for each failure, so each gets a `kind`:
 *
 *   - `unconfigured` — no token in this deployment. Not RealScout's fault and
 *     not a request failure; the sync treats it as "nothing to do".
 *   - `auth` (401) — the token is wrong, revoked or expired.
 *   - `scope` (403) — the token works but lacks a scope. The missing scope's
 *     name is lifted out of the message into {@link RealScoutError.missingScope}
 *     so a diagnostic can say *which* one rather than "forbidden". Without
 *     `contacts:write` the push direction cannot work at all, and that has to
 *     be reportable rather than surfacing as an opaque failure on every lead.
 *   - `invalid_request` (400) — our payload. `field` names the input.
 *   - `not_found` (404) — no such record, or another agent's.
 *   - `rate_limited` (429) — budget spent; `retryAfterSeconds` says how long.
 *   - `server` (5xx) and `network` — transient.
 *
 * ## Rate limits
 *
 * Per the spec: 60 list calls, 300 single reads and 120 writes per minute per
 * token. A 429 carries `Retry-After` in seconds, and the documentation is
 * explicit that retrying before then does not help — so this waits that long
 * rather than hammering, and only for a bounded number of attempts and a
 * bounded delay. A `Retry-After` longer than {@link MAX_RETRY_WAIT_MS} is
 * surfaced as a `rate_limited` error instead of being slept through, because
 * this code runs inside serverless function invocations that have their own
 * ceiling and a silent 60-second stall is worse than a reported failure.
 *
 * `X-RateLimit-Remaining` is read off every response and handed back as
 * {@link RealScoutPage.rateLimit}, which is what lets the paginator slow down
 * *before* it is refused rather than after.
 */

import { env } from '@/config/env';

/** Base URL for every call. Single-sourced so no call site builds its own. */
export const REALSCOUT_BASE_URL = 'https://www.realscout.com/api/agent/v1';

/** How many times a transient failure (429, 5xx, network) is retried. */
const MAX_ATTEMPTS = 3;

/**
 * The longest this client will sleep on a `Retry-After` before giving up.
 *
 * 20 seconds, because a cron invocation that stalls past its own timeout
 * reports nothing at all, whereas a `rate_limited` error names the condition
 * and the next scheduled run picks up the same window again — the overlapping
 * window in the sync is what makes that safe.
 */
const MAX_RETRY_WAIT_MS = 20_000;

/** Per-request network timeout. A hung socket must not hold a function open. */
const REQUEST_TIMEOUT_MS = 15_000;

/** Backoff for a 5xx or a network fault, which carry no `Retry-After`. */
const TRANSIENT_BACKOFF_MS = [500, 1_500] as const;

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/** How a RealScout call failed, in the terms a caller has to branch on. */
export type RealScoutFailureKind =
  | 'unconfigured'
  | 'auth'
  | 'scope'
  | 'invalid_request'
  | 'not_found'
  | 'rate_limited'
  | 'server'
  | 'network';

/** The error body every RealScout failure carries. */
interface RealScoutErrorBody {
  code?: unknown;
  message?: unknown;
  field?: unknown;
  request_id?: unknown;
}

/**
 * A failed RealScout call.
 *
 * Never carries the token, and never carries a response body verbatim beyond
 * the four named fields below — a RealScout message is external text and these
 * errors reach logs.
 */
export class RealScoutError extends Error {
  readonly kind: RealScoutFailureKind;
  /** HTTP status, or null for `unconfigured` and `network`. */
  readonly status: number | null;
  /** RealScout's own `error.code`, when there was a parseable body. */
  readonly code: string | null;
  /** For `scope`: the scope named in the 403 message, e.g. `contacts:write`. */
  readonly missingScope: string | null;
  /** For `invalid_request`: the input RealScout objected to. */
  readonly field: string | null;
  /** RealScout's `request_id`, which support needs to find the call. */
  readonly requestId: string | null;
  /** For `rate_limited`: seconds until the budget refills. */
  readonly retryAfterSeconds: number | null;

  constructor(
    kind: RealScoutFailureKind,
    message: string,
    detail: {
      status?: number | null;
      code?: string | null;
      missingScope?: string | null;
      field?: string | null;
      requestId?: string | null;
      retryAfterSeconds?: number | null;
    } = {},
  ) {
    super(message);
    this.name = 'RealScoutError';
    this.kind = kind;
    this.status = detail.status ?? null;
    this.code = detail.code ?? null;
    this.missingScope = detail.missingScope ?? null;
    this.field = detail.field ?? null;
    this.requestId = detail.requestId ?? null;
    this.retryAfterSeconds = detail.retryAfterSeconds ?? null;
  }
}

/**
 * Lift the scope name out of a 403 message.
 *
 * The documented shape is "This call requires the contacts:write scope, which
 * this credential was not granted." The scopes are granular — `contacts:read`,
 * `contacts:write`, `account:read`, `listing_alerts:read`, `listing_links:read`
 * — and which one is missing decides whether a feature can work at all, so it
 * is worth parsing rather than discarding.
 *
 * Returns null when the message does not name one, so a caller reports "a scope
 * is missing and RealScout did not say which" rather than inventing a name.
 */
export function missingScopeFrom(message: string): string | null {
  const match = /\b([a-z][a-z_]*:[a-z][a-z_]*)\b/.exec(message);
  return match?.[1] ?? null;
}

/* ------------------------------------------------------------------ *
 * Response shapes
 * ------------------------------------------------------------------ */

/** What a response said about the remaining budget, when it said anything. */
export interface RealScoutRateLimit {
  limit: number | null;
  remaining: number | null;
  /** Epoch seconds at which the window resets. */
  reset: number | null;
}

/** One page of a list endpoint, with the budget the page was read under. */
export interface RealScoutPage<T> {
  data: T[];
  hasMore: boolean;
  nextCursor: string | null;
  rateLimit: RealScoutRateLimit;
}

/** A contact's designation, as RealScout reports it. */
export interface RealScoutContactStatus {
  value: string | null;
  reasons: string[] | null;
}

/** RealScout's Auto Nurture state for a contact. */
export interface RealScoutAutoNurture {
  enabled: boolean | null;
  first_enabled_at: string | null;
}

/**
 * A contact, narrowed to the fields this app reads.
 *
 * Deliberately not the whole documented object: a field nothing here consumes
 * is a field that cannot drift. The index signature keeps an unlisted field
 * from being a parse error.
 */
export interface RealScoutContact {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  primary_mobile_phone: string | null;
  lead_source: string | null;
  contact_type: string | null;
  external_user_key: string | null;
  tags: string[] | null;
  realscout_tags: string[] | null;
  external_tags: string[] | null;
  emailable: boolean | null;
  email_issue: string | null;
  status: RealScoutContactStatus | null;
  auto_nurture: RealScoutAutoNurture | null;
  scout_score: number | null;
  scout_score_change_7d: number | null;
  scout_score_change_30d: number | null;
  scout_score_summary_7d: string | null;
  scout_score_summary_30d: string | null;
  realscout_url: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_active_at: string | null;
  archived_at: string | null;
  [key: string]: unknown;
}

/** The published activity actions, as the spec's 400 message lists them. */
export const REALSCOUT_ACTIONS = [
  'view',
  'save',
  'unsave',
  'hide',
  'unhide',
  'rated',
  'comment',
  'request_showing',
  'open_house_view',
  'home_report_view',
  'market_alert_view',
  'cma_view',
] as const;

export type RealScoutAction = (typeof REALSCOUT_ACTIONS)[number];

/**
 * What an activity row was about.
 *
 * `type` tells a Property from a HomeReport, MarketAlert or CmaReport, and the
 * fields present depend on it — hence every one optional.
 */
export interface RealScoutActionable {
  type: string | null;
  id?: string | null;
  mls_number?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
  price?: number | null;
  valuation?: number | null;
  status?: string | null;
  beds?: number | null;
  baths?: number | null;
  name?: string | null;
  title?: string | null;
  subject_address?: string | null;
  realscout_url?: string | null;
  [key: string]: unknown;
}

/** One thing a contact did. */
export interface RealScoutActivity {
  id: string;
  action: string;
  created_at: string | null;
  contact: { id: string | null; realscout_url?: string | null } | null;
  rating: number | null;
  view_count: number | null;
  actionable: RealScoutActionable | null;
  [key: string]: unknown;
}

/** The calling agent's account, narrowed to what the diagnostic reports. */
export interface RealScoutAccount {
  id: string;
  full_name: string | null;
  email: string | null;
  brokerage_name: string | null;
  subdomain: string | null;
  /** The scopes this credential carries — the answer the diagnostic wants. */
  scopes: string[];
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ *
 * Transport
 * ------------------------------------------------------------------ */

/** Whether this deployment has a RealScout token at all. */
export function realScoutConfigured(): boolean {
  const token = env.REALSCOUT_API_TOKEN;
  return typeof token === 'string' && token.trim().length > 0;
}

/** The token, or a thrown `unconfigured` error. Never logged by callers. */
function requireToken(): string {
  const token = env.REALSCOUT_API_TOKEN;
  if (typeof token !== 'string' || token.trim().length === 0) {
    throw new RealScoutError(
      'unconfigured',
      'REALSCOUT_API_TOKEN is not set in this deployment.',
    );
  }
  return token.trim();
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** A header value as a finite number, or null. */
function numericHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function rateLimitFrom(headers: Headers): RealScoutRateLimit {
  return {
    limit: numericHeader(headers, 'X-RateLimit-Limit'),
    remaining: numericHeader(headers, 'X-RateLimit-Remaining'),
    reset: numericHeader(headers, 'X-RateLimit-Reset'),
  };
}

/** A string field off an error body, or null. Never trusted to be a string. */
function stringField(body: RealScoutErrorBody, key: keyof RealScoutErrorBody): string | null {
  const value = body[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Map a non-2xx response onto a classified error. */
function classify(status: number, headers: Headers, body: RealScoutErrorBody): RealScoutError {
  const code = stringField(body, 'code');
  const message = stringField(body, 'message');
  const requestId = stringField(body, 'request_id');
  const field = stringField(body, 'field');
  const shared = { status, code, requestId };

  if (status === 401) {
    return new RealScoutError(
      'auth',
      message ?? 'RealScout rejected the credential.',
      shared,
    );
  }

  if (status === 403) {
    const scope = message === null ? null : missingScopeFrom(message);
    return new RealScoutError(
      'scope',
      scope === null
        ? 'RealScout refused the call for a missing scope and did not name it.'
        : `RealScout requires the ${scope} scope, which this token was not granted.`,
      { ...shared, missingScope: scope },
    );
  }

  if (status === 429) {
    const retryAfter = numericHeader(headers, 'Retry-After');
    return new RealScoutError(
      'rate_limited',
      message ?? 'RealScout rate limit exceeded.',
      { ...shared, retryAfterSeconds: retryAfter },
    );
  }

  if (status === 404) {
    return new RealScoutError('not_found', message ?? 'No such RealScout record.', shared);
  }

  if (status >= 500) {
    return new RealScoutError('server', message ?? 'RealScout returned a server error.', shared);
  }

  return new RealScoutError(
    'invalid_request',
    message ?? `RealScout refused the request with status ${status}.`,
    { ...shared, field },
  );
}

/** A successful response, with the headers the caller needs. */
interface RealScoutResult<T> {
  body: T;
  status: number;
  rateLimit: RealScoutRateLimit;
}

/**
 * One authenticated call, with retries for the transient failures only.
 *
 * `allowStatuses` lets a caller take delivery of a non-2xx response instead of
 * an error. That exists for exactly one case — `POST /contacts` answering 400
 * on an email a live contact already holds, which is an outcome to handle and
 * not a failure — and is spelled out at that call site.
 */
async function realScoutRequest<T>(
  path: string,
  init: {
    method?: 'GET' | 'POST' | 'PATCH';
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    allowStatuses?: readonly number[];
  } = {},
): Promise<RealScoutResult<T>> {
  const token = requireToken();
  const method = init.method ?? 'GET';

  const url = new URL(`${REALSCOUT_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value === undefined) continue;
    url.searchParams.set(key, String(value));
  }

  let lastTransient: RealScoutError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers: {
          // The one place the token is used. Never logged, never returned.
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch (cause) {
      // A DNS failure, a reset socket or the timeout above. The message is ours
      // rather than the thrown one so a URL with a query string — which can
      // carry a contact's email — does not land in a log.
      lastTransient = new RealScoutError(
        'network',
        `Could not reach RealScout (${method} ${path}).`,
      );
      if (attempt === MAX_ATTEMPTS) throw lastTransient;
      await sleep(TRANSIENT_BACKOFF_MS[attempt - 1] ?? 1_500);
      continue;
    }

    const rateLimit = rateLimitFrom(response.headers);

    if (response.ok || init.allowStatuses?.includes(response.status)) {
      // 204 and an empty body are not expected on any endpoint used here, but a
      // JSON parse failure must not read as a transport failure.
      const body = (await response.json().catch(() => null)) as T;
      return { body, status: response.status, rateLimit };
    }

    const errorBody = ((await response.json().catch(() => null)) ?? {}) as {
      error?: RealScoutErrorBody;
    };
    const error = classify(response.status, response.headers, errorBody.error ?? {});

    // 401, 403, 400 and 404 will not change on a retry.
    if (error.kind !== 'rate_limited' && error.kind !== 'server') throw error;

    lastTransient = error;
    if (attempt === MAX_ATTEMPTS) throw error;

    if (error.kind === 'rate_limited') {
      // The documentation is explicit that retrying before `Retry-After` does
      // not help, so this waits — or reports, when the wait is longer than a
      // function invocation should hold for.
      const waitMs = (error.retryAfterSeconds ?? 1) * 1_000;
      if (waitMs > MAX_RETRY_WAIT_MS) throw error;
      await sleep(waitMs);
      continue;
    }

    await sleep(TRANSIENT_BACKOFF_MS[attempt - 1] ?? 1_500);
  }

  // Unreachable: the loop either returns or throws. Kept so the signature does
  // not depend on the compiler's reachability analysis.
  throw lastTransient ?? new RealScoutError('network', 'RealScout call did not complete.');
}

/* ------------------------------------------------------------------ *
 * Endpoints
 * ------------------------------------------------------------------ */

/** `GET /me` — the calling agent, including the scopes the token carries. */
export async function getRealScoutAccount(): Promise<RealScoutAccount> {
  const { body } = await realScoutRequest<RealScoutAccount>('/me');
  return body;
}

/** Filters `GET /contacts` accepts, narrowed to the ones this app sends. */
export interface ListContactsParams {
  email?: string;
  external_user_key?: string;
  updated_after?: string;
  emailable?: boolean;
  status?: string;
  sort?: 'created_at' | 'last_active_at' | 'scout_score';
  order?: 'ASC' | 'DESC';
  cursor?: string;
  limit?: number;
}

/** `GET /contacts` — one page. Requires `contacts:read`. */
export async function listRealScoutContacts(
  params: ListContactsParams = {},
): Promise<RealScoutPage<RealScoutContact>> {
  const { body, rateLimit } = await realScoutRequest<{
    data?: RealScoutContact[];
    has_more?: boolean;
    next_cursor?: string | null;
  }>('/contacts', { query: { ...params } });

  return {
    data: body?.data ?? [],
    hasMore: body?.has_more === true,
    nextCursor: body?.next_cursor ?? null,
    rateLimit,
  };
}

/** Filters `GET /activity` accepts. */
export interface ListActivityParams {
  contact_id?: string;
  actions?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

/** `GET /activity` — one page. Requires `contacts:read`. */
export async function listRealScoutActivity(
  params: ListActivityParams = {},
): Promise<RealScoutPage<RealScoutActivity>> {
  const { body, rateLimit } = await realScoutRequest<{
    data?: RealScoutActivity[];
    has_more?: boolean;
    next_cursor?: string | null;
  }>('/activity', { query: { ...params } });

  return {
    data: body?.data ?? [],
    hasMore: body?.has_more === true,
    nextCursor: body?.next_cursor ?? null,
    rateLimit,
  };
}

/** The body `POST /contacts` takes, narrowed to the fields this app sends. */
export interface CreateContactInput {
  email: string;
  first_name?: string;
  last_name?: string;
  primary_mobile_phone?: string;
  lead_source?: string;
  contact_type?: string;
  note?: string;
  tags?: string[];
  external_user_key?: string;
  /** Sent explicitly — see the push path for why it is always `false`. */
  price_status_alerts_enabled: boolean;
  /** Sent explicitly — see the push path for why it is always `false`. */
  exclusives_alerts_enabled: boolean;
}

/**
 * What `POST /contacts` did.
 *
 * Three outcomes rather than two, because the spec documents two behaviours
 * that a "non-201 means failure" reading would get wrong:
 *
 *   - `created` — a new contact, or a previously **deleted** contact revived.
 *     RealScout brings a deleted contact back when a create matches their
 *     address, and the response is a normal 201, so the two are
 *     indistinguishable here. The caller is told via `mayHaveRevived`.
 *   - `exists` — the address already belongs to a live contact. RealScout
 *     refuses that with `400 invalid_request` and `field: "email"`, and the
 *     documented remedy is to look the contact up rather than retry. That is
 *     success for our purposes: the person is in RealScout, which is the whole
 *     point of the push.
 */
export type CreateContactOutcome =
  | { status: 'created'; contact: RealScoutContact | null }
  | { status: 'exists'; message: string };

/**
 * `POST /contacts`. Requires `contacts:write`.
 *
 * A 400 naming `email` is taken delivery of rather than thrown, because it is
 * the documented response to an address a live contact already holds — an
 * outcome, not a fault. Every other 400 still throws.
 */
export async function createRealScoutContact(
  input: CreateContactInput,
): Promise<CreateContactOutcome> {
  const { body, status } = await realScoutRequest<{
    contact?: RealScoutContact | null;
    error?: RealScoutErrorBody;
  }>('/contacts', { method: 'POST', body: input, allowStatuses: [400] });

  if (status === 400) {
    const error = body?.error ?? {};
    const field = stringField(error, 'field');
    const message = stringField(error, 'message');

    if (field === 'email') {
      return {
        status: 'exists',
        message: message ?? 'RealScout already has a live contact at that address.',
      };
    }

    throw classify(400, new Headers(), error);
  }

  return { status: 'created', contact: body?.contact ?? null };
}

/* ------------------------------------------------------------------ *
 * Pagination
 * ------------------------------------------------------------------ */

/** Page size. The documented maximum, so a sync spends the fewest list calls. */
export const CONTACT_PAGE_SIZE = 100;

/**
 * Below this many calls left in the window, the paginator waits for the reset.
 *
 * One rather than zero: stopping at zero means the next call is the one that is
 * refused, and a 429 inside a cron run costs the whole batch its remaining
 * time. The list budget is 60 a minute at 100 rows a page, so a book of any
 * realistic size never reaches this.
 */
const RATE_LIMIT_FLOOR = 1;

/**
 * Page through `GET /contacts`, newest cursor first, respecting the budget.
 *
 * `maxPages` is a hard stop so a cron invocation cannot page forever: an
 * unbounded loop against a 6,000-contacts-a-minute ceiling is a function that
 * times out and reports nothing. Reaching it is reported by the caller.
 */
export async function* pagesOfRealScoutContacts(
  params: ListContactsParams,
  maxPages: number,
): AsyncGenerator<RealScoutPage<RealScoutContact>> {
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const result: RealScoutPage<RealScoutContact> = await listRealScoutContacts({
      ...params,
      limit: params.limit ?? CONTACT_PAGE_SIZE,
      ...(cursor === null ? {} : { cursor }),
    });

    yield result;

    if (!result.hasMore || result.nextCursor === null) return;
    cursor = result.nextCursor;

    const { remaining, reset } = result.rateLimit;
    if (remaining !== null && remaining <= RATE_LIMIT_FLOOR && reset !== null) {
      const waitMs = reset * 1_000 - Date.now();
      if (waitMs > 0 && waitMs <= MAX_RETRY_WAIT_MS) await sleep(waitMs);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Connectivity check
 * ------------------------------------------------------------------ */

/** The three endpoints the probe exercises. */
export type RealScoutProbeTarget = 'me' | 'contacts' | 'activity';

/**
 * What one probe found.
 *
 * `status` is the HTTP status RealScout answered with, so the report can state
 * it literally. `reason` is the classified failure, and `missingScope` names
 * the scope on a 403 — the single most useful thing the check can tell an
 * operator, because a missing `contacts:write` means the push direction cannot
 * work and a missing `contacts:read` means the sync cannot.
 */
export interface RealScoutProbe {
  target: RealScoutProbeTarget;
  endpoint: string;
  reachable: boolean;
  status: number | null;
  reason: RealScoutFailureKind | null;
  detail: string | null;
  missingScope: string | null;
  requestId: string | null;
  retryAfterSeconds: number | null;
}

/** The whole connectivity picture. Carries nothing derived from the token. */
export interface RealScoutProbeReport {
  configured: boolean;
  checkedAt: string;
  /** Scopes `GET /me` reported, or null when that call did not succeed. */
  scopes: string[] | null;
  /** Whether the push direction in the lead pipeline can work at all. */
  canWriteContacts: boolean | null;
  /** Identifying detail from `/me`, so an operator can confirm whose token it is. */
  account: { id: string; name: string | null; brokerage: string | null } | null;
  probes: RealScoutProbe[];
}

/** Run one probe, turning any failure into a reportable row. */
async function probe(
  target: RealScoutProbeTarget,
  endpoint: string,
  call: () => Promise<unknown>,
): Promise<RealScoutProbe> {
  const base = {
    target,
    endpoint,
    missingScope: null,
    requestId: null,
    retryAfterSeconds: null,
  };

  try {
    await call();
    return { ...base, reachable: true, status: 200, reason: null, detail: null };
  } catch (error) {
    if (error instanceof RealScoutError) {
      return {
        target,
        endpoint,
        reachable: false,
        status: error.status,
        reason: error.kind,
        detail: error.message,
        missingScope: error.missingScope,
        requestId: error.requestId,
        retryAfterSeconds: error.retryAfterSeconds,
      };
    }

    // Not a RealScout error at all — a bug in this module, or a runtime fault.
    // Reported as `network` with our own wording rather than the thrown
    // message, which could carry a URL and therefore a contact's email.
    return {
      ...base,
      reachable: false,
      status: null,
      reason: 'network',
      detail: 'The probe threw something other than a RealScout error.',
    };
  }
}

/**
 * Probe `GET /me`, `GET /contacts?limit=1` and `GET /activity?limit=1`.
 *
 * All three run even when the first fails, because "the token is valid but has
 * no `contacts:read`" and "the token is invalid" are different problems and an
 * operator needs to see which. `limit=1` keeps the cost at one row per list.
 */
export async function probeRealScout(): Promise<RealScoutProbeReport> {
  const checkedAt = new Date().toISOString();

  if (!realScoutConfigured()) {
    return {
      configured: false,
      checkedAt,
      scopes: null,
      canWriteContacts: null,
      account: null,
      probes: (['me', 'contacts', 'activity'] as const).map((target) => ({
        target,
        endpoint: target === 'me' ? 'GET /me' : `GET /${target}?limit=1`,
        reachable: false,
        status: null,
        reason: 'unconfigured' as const,
        detail: 'REALSCOUT_API_TOKEN is not set in this deployment.',
        missingScope: null,
        requestId: null,
        retryAfterSeconds: null,
      })),
    };
  }

  // Held in a box rather than a bare `let` so the assignment inside the probe
  // callback is visible to the type checker afterwards.
  const found: { account: RealScoutAccount | null } = { account: null };

  // Sequential, not parallel. Three calls is nothing against the budget, but
  // running them in order means a 429 on the first does not also exhaust the
  // retry budget of the other two against the same spent window.
  const meProbe = await probe('me', 'GET /me', async () => {
    found.account = await getRealScoutAccount();
  });
  const contactsProbe = await probe('contacts', 'GET /contacts?limit=1', () =>
    listRealScoutContacts({ limit: 1 }),
  );
  const activityProbe = await probe('activity', 'GET /activity?limit=1', () =>
    listRealScoutActivity({ limit: 1 }),
  );

  const account = found.account;
  const scopes = account === null ? null : (account.scopes ?? []);

  return {
    configured: true,
    checkedAt,
    scopes,
    canWriteContacts: scopes === null ? null : scopes.includes('contacts:write'),
    account:
      account === null
        ? null
        : {
            id: account.id,
            name: account.full_name ?? null,
            brokerage: account.brokerage_name ?? null,
          },
    probes: [meProbe, contactsProbe, activityProbe],
  };
}
