/**
 * Best-effort request limiting for the client-facing AI assistant endpoint.
 *
 * Every request is counted — successful ones included. That is the difference
 * between this module and `src/lib/auth/rate-limit.ts`, and it is the entire
 * reason this module exists. The login limiter counts *failures*, which is the
 * right model for password guessing: a caller who keeps succeeding is not
 * attacking anything. On a metered AI endpoint the inverse holds. A script
 * looping perfectly valid requests is the abuse case, and a failure counter
 * never sees it.
 *
 * ## Its own keyspace, deliberately
 *
 * The counters live in a `Map` private to this module, and keys carry the
 * {@link KEY_PREFIX} namespace. Nothing here can read or write the `failures`
 * Map inside `rate-limit.ts`. That separation is load-bearing rather than
 * tidiness: both limiters key on client IP, so a shared store would let chat
 * traffic from an address push the login counter over its threshold and lock
 * the operator out of his own dashboard from the machine he is sitting at.
 *
 * What *is* shared is {@link rateLimitKey}, imported from that module. Its
 * Netlify header ordering and its shared header-less fallback bucket are
 * general, carefully reasoned, and should not be reimplemented here.
 *
 * ## Per-instance, and therefore approximate
 *
 * The store is module-scoped, so it only covers the function instance that
 * happens to serve the request. Netlify scales functions horizontally, which
 * means the real ceiling is the configured limit multiplied by however many
 * instances are warm — a caller spreading requests across cold starts gets more
 * than {@link MAX_REQUESTS_PER_IP} suggests.
 *
 * That weakness is accepted, and it is worth being precise about what it costs.
 * For the login route the exposure is a password being guessed. Here the
 * exposure is **spend**: every request that gets through is a paid model call on
 * Joey's account. Nothing is breached when this limiter is evaded, it just costs
 * money, and the bill scales with how many instances are warm rather than with
 * the number on the constant below.
 *
 * What it does stop is the realistic version of the problem — an unattended
 * script, or a loop left running against a warm instance. It is a cost guard,
 * not a security control, and it should not be described as one.
 *
 * The fix that would make it exact is shared storage: a counter table or a
 * Redis-style store, incremented per request, so every instance reads one view
 * of the truth. `rate-limit.ts` notes the same follow-up for the same reason.
 * It is out of scope here, and this module is the seam it drops into — the
 * function shapes below survive, only the storage changes (to async, at that
 * point).
 */

import { rateLimitKey } from '@/lib/auth/rate-limit';

/**
 * Namespace every key in this module carries.
 *
 * Present so a key read out of this store is obviously not a login-limiter key,
 * and so the two can never be confused if they are ever logged side by side.
 */
export const KEY_PREFIX = 'assistant:rl:';

/**
 * Requests permitted per client IP inside {@link IP_WINDOW_SECONDS}.
 *
 * Ten a minute is far above what a person typing into a chat panel produces —
 * reading a reply alone takes longer than six seconds — and far below what an
 * unattended loop produces. The spec does not name a figure, so this is chosen
 * to sit in that gap rather than derived from a requirement.
 */
export const MAX_REQUESTS_PER_IP = 10;

/** Window length for the per-IP limit. */
export const IP_WINDOW_SECONDS = 60;

/**
 * Requests permitted per chat session inside {@link SESSION_WINDOW_SECONDS}.
 *
 * The per-IP limit governs bursts; this one governs a whole conversation, and
 * caps what any single session can cost in an hour regardless of how patiently
 * it paces itself under the per-minute ceiling. Forty turns is a long
 * conversation by any honest reading of one.
 */
export const MAX_REQUESTS_PER_SESSION = 40;

/** Window length for the per-session limit. */
export const SESSION_WINDOW_SECONDS = 60 * 60;

/**
 * Longest key segment retained before truncation.
 *
 * Session identifiers arrive in the request body, so their length is set by the
 * caller. Truncating bounds what one key can cost in memory. Two identifiers
 * sharing a prefix this long would share a bucket, which tightens the limit
 * rather than loosening it — the safe direction for a mistake to fall in.
 */
const MAX_KEY_LENGTH = 200;

/**
 * Map size that triggers a sweep of aged-out keys.
 *
 * Keys derive from client IPs and caller-supplied session identifiers, so how
 * many of them exist is decided by whoever is sending requests, not by this
 * process. Without a sweep a long-lived warm instance would hold a bucket for
 * every address and session it has ever seen.
 */
const SWEEP_AFTER_KEYS = 1000;

/** Request timestamps in unix milliseconds, newest last, keyed by namespaced key. */
const requests = new Map<string, number[]>();

/** Outcome of a request-limit check. `retryAfterSeconds` is present only when refused. */
export interface RequestLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/** One limit's configuration: how many requests, over how long, under what namespace. */
interface LimitPolicy {
  namespace: string;
  limit: number;
  windowMs: number;
}

/** Per-client-IP burst limit. */
const IP_POLICY: LimitPolicy = {
  namespace: `${KEY_PREFIX}ip:`,
  limit: MAX_REQUESTS_PER_IP,
  windowMs: IP_WINDOW_SECONDS * 1000,
};

/** Per-conversation hourly limit. */
const SESSION_POLICY: LimitPolicy = {
  namespace: `${KEY_PREFIX}session:`,
  limit: MAX_REQUESTS_PER_SESSION,
  windowMs: SESSION_WINDOW_SECONDS * 1000,
};

/** The stored key for a caller-supplied key under a policy. */
function storeKey(policy: LimitPolicy, key: string): string {
  return `${policy.namespace}${key.slice(0, MAX_KEY_LENGTH)}`;
}

/**
 * Timestamps for a stored key that still fall inside the window.
 *
 * Pruning happens on access rather than on a timer, so an idle key costs
 * nothing. The pruned bucket is written back — or dropped when it empties — so
 * the same filtering is not repeated on every later call.
 *
 * A timestamp exactly `windowMs` old counts as aged out, matching the strict
 * comparison the login limiter and the session module both use.
 */
function withinWindow(
  policy: LimitPolicy,
  stored: string,
  now: number,
): number[] {
  const recorded = requests.get(stored);
  if (recorded === undefined) return [];

  const cutoff = now - policy.windowMs;
  const recent = recorded.filter((timestamp) => timestamp > cutoff);

  if (recent.length === 0) requests.delete(stored);
  else if (recent.length !== recorded.length) requests.set(stored, recent);

  return recent;
}

/** Drop every key whose most recent request has aged out of the longest window. */
function sweep(now: number): void {
  // The longest window of any policy, so a sweep triggered while checking the
  // per-minute limit cannot discard per-hour history that is still live.
  const cutoff = now - Math.max(IP_POLICY.windowMs, SESSION_POLICY.windowMs);

  for (const [stored, timestamps] of requests) {
    const newest = timestamps[timestamps.length - 1];
    if (newest === undefined || newest <= cutoff) requests.delete(stored);
  }
}

/**
 * Count one request against a policy and report whether it is permitted.
 *
 * A refused request is **not** recorded. Counting refusals would mean a caller
 * polling faster than the limit never drains its window and stays refused
 * indefinitely, which would make {@link RequestLimitResult.retryAfterSeconds} a
 * promise this module does not keep. A refused request also never reaches the
 * model, so it costs nothing and there is nothing to meter.
 */
function consume(policy: LimitPolicy, key: string): RequestLimitResult {
  const now = Date.now();
  const stored = storeKey(policy, key);
  const recent = withinWindow(policy, stored, now);

  if (recent.length >= policy.limit) {
    // Timestamps are appended in order, so index 0 is the oldest, and its
    // departure from the window is what frees the next request.
    const oldest = recent[0] ?? now;

    // At least a second, so `Retry-After: 0` never tells a client to retry
    // immediately into another refusal.
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + policy.windowMs - now) / 1000),
    );

    return { allowed: false, retryAfterSeconds };
  }

  recent.push(now);

  // Only the newest `limit` timestamps can affect a decision, so the rest are
  // discarded. This bounds one bucket's array under sustained traffic.
  requests.set(stored, recent.slice(-policy.limit));

  if (requests.size > SWEEP_AFTER_KEYS) sweep(now);

  return { allowed: true };
}

/**
 * Count one assistant request against a client IP and report whether it stands.
 *
 * Call this before parsing the body and before any model call, so a refusal is
 * cheap. Counting after the model call would make this a delay rather than a
 * limit, and the spend would already have happened.
 *
 * Unlike `checkRateLimit`, this both checks *and* records in one step — hence
 * the name. There is no separate "record" call to forget, which is what makes
 * counting successful requests the default rather than an opt-in.
 *
 * @param key - Usually the value from {@link rateLimitKey}.
 * @returns `{ allowed: true }`, or `{ allowed: false, retryAfterSeconds }` where
 *   the wait is long enough for the oldest counted request to leave the window.
 *
 * @example
 * const limit = checkAndCount(rateLimitKey(request.headers));
 * if (!limit.allowed) {
 *   return NextResponse.json({ error: 'Too many requests' }, {
 *     status: 429,
 *     headers: { 'Retry-After': String(limit.retryAfterSeconds) },
 *   });
 * }
 */
export function checkAndCount(key: string): RequestLimitResult {
  return consume(IP_POLICY, key);
}

/**
 * Count one assistant request against a chat session and report whether it stands.
 *
 * Separate from {@link checkAndCount} because the two limits answer different
 * questions — bursts versus total conversation cost — and because a session
 * identifier is only available after the request body has been read, which puts
 * this check later in the handler by necessity.
 *
 * Its own namespace, so a session identifier that happens to look like an IP
 * address cannot land in the per-IP bucket.
 *
 * @param sessionId - The session identifier from the validated request body.
 */
export function checkAndCountSession(sessionId: string): RequestLimitResult {
  return consume(SESSION_POLICY, sessionId);
}

/**
 * Derive the per-IP limit key for a request.
 *
 * A thin re-export of {@link rateLimitKey} so callers of this module do not have
 * to reach into the auth package for it, and so the Netlify header ordering and
 * the shared header-less fallback bucket stay defined in exactly one place.
 */
export { rateLimitKey };
