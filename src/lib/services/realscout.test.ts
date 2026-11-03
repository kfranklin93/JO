import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The RealScout client: authentication, error classification, rate limits and
 * the connectivity probe.
 *
 * The assertions that matter are about *which* failure a caller is told about.
 * A 401, a 403 and a 429 look the same to a `response.ok` check and need three
 * different responses from an operator — replace the token, grant a scope, wait
 * — and the 403 case has to name the scope, because without `contacts:write`
 * the push direction cannot work and that has to be reportable rather than
 * failing obscurely on every lead.
 *
 * One negative assertion runs throughout: the token never appears in anything
 * this module produces. It is checked explicitly at the end.
 */

const testEnv: Record<string, unknown> = {};
vi.mock('@/config/env', () => ({ env: testEnv }));

const TOKEN = 'rs_agent_do_not_leak_me';

const {
  createRealScoutContact,
  listRealScoutActivity,
  listRealScoutContacts,
  missingScopeFrom,
  pagesOfRealScoutContacts,
  probeRealScout,
  realScoutConfigured,
  RealScoutError,
  REALSCOUT_BASE_URL,
} = await import('./realscout');

const fetchMock = vi.fn();

/** A JSON response with optional headers. */
function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** RealScout's uniform error body. */
const errorBody = (
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) => ({ error: { code, message, request_id: 'req-1', ...extra } });

beforeEach(() => {
  for (const key of Object.keys(testEnv)) delete testEnv[key];
  testEnv.REALSCOUT_API_TOKEN = TOKEN;

  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The URL of the nth fetch call, as a string. */
const calledUrl = (index = 0): string => String(fetchMock.mock.calls[index]?.[0]);

/** The init object of the nth fetch call. */
const calledInit = (index = 0): RequestInit =>
  (fetchMock.mock.calls[index]?.[1] ?? {}) as RequestInit;

describe('configuration', () => {
  it('reports configured only when the token is a non-blank string', () => {
    expect(realScoutConfigured()).toBe(true);

    testEnv.REALSCOUT_API_TOKEN = '   ';
    expect(realScoutConfigured()).toBe(false);

    delete testEnv.REALSCOUT_API_TOKEN;
    expect(realScoutConfigured()).toBe(false);
  });

  it('throws `unconfigured` rather than calling RealScout without a token', async () => {
    delete testEnv.REALSCOUT_API_TOKEN;

    await expect(listRealScoutContacts()).rejects.toMatchObject({
      name: 'RealScoutError',
      kind: 'unconfigured',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('requests', () => {
  it('sends a bearer token against the documented base URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [], has_more: false }));

    await listRealScoutContacts({ limit: 1 });

    expect(calledUrl()).toBe(`${REALSCOUT_BASE_URL}/contacts?limit=1`);
    const headers = calledInit().headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('omits an undefined filter instead of sending the string "undefined"', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: [], has_more: false }));

    // Cast because `exactOptionalPropertyTypes` forbids writing this through the
    // typed signature — which is the point: the guard is for a value that
    // arrives as undefined at runtime, from a spread or a JSON body, where the
    // compiler is not watching. An unknown query parameter is refused by
    // RealScout outright, so `email=undefined` would be a 400.
    await listRealScoutContacts({ email: undefined, limit: 25 } as unknown as Parameters<
      typeof listRealScoutContacts
    >[0]);

    expect(calledUrl()).not.toContain('email');
    expect(calledUrl()).toContain('limit=25');
  });

  it('reads the rate-limit headers off a successful page', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        200,
        { data: [], has_more: false, next_cursor: null },
        {
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': '58',
          'X-RateLimit-Reset': '1800000000',
        },
      ),
    );

    const page = await listRealScoutContacts();

    expect(page.rateLimit).toEqual({ limit: 60, remaining: 58, reset: 1800000000 });
  });
});

describe('error classification', () => {
  it('names the missing scope from a 403, which is the whole point of the check', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        403,
        errorBody(
          'missing_scope',
          'This call requires the contacts:write scope, which this credential was not granted.',
        ),
      ),
    );

    const error = await createRealScoutContact({
      email: 'nora@example.com',
      price_status_alerts_enabled: false,
      exclusives_alerts_enabled: false,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RealScoutError);
    expect(error).toMatchObject({
      kind: 'scope',
      status: 403,
      missingScope: 'contacts:write',
      requestId: 'req-1',
    });
    expect((error as Error).message).toContain('contacts:write');
  });

  it('names contacts:read when that is the scope a read was refused for', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        403,
        errorBody(
          'missing_scope',
          'This call requires the contacts:read scope, which this credential was not granted.',
        ),
      ),
    );

    await expect(listRealScoutActivity({ limit: 1 })).rejects.toMatchObject({
      kind: 'scope',
      missingScope: 'contacts:read',
    });
  });

  it('reports a scope failure honestly when the message names no scope', async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, errorBody('missing_scope', 'Forbidden.')));

    await expect(listRealScoutContacts()).rejects.toMatchObject({
      kind: 'scope',
      missingScope: null,
    });
  });

  it('distinguishes a bad token (401) from a missing scope (403)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, errorBody('unauthorized', 'Invalid or missing credentials.')),
    );

    await expect(listRealScoutContacts()).rejects.toMatchObject({
      kind: 'auth',
      status: 401,
      missingScope: null,
    });
  });

  it('does not retry a 401 — the answer will not change', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, errorBody('unauthorized', 'nope')));

    await expect(listRealScoutContacts()).rejects.toMatchObject({ kind: 'auth' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('classifies a 404 and a 400, carrying the field a 400 names', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, errorBody('not_found', 'No endpoint.')));
    await expect(listRealScoutContacts()).rejects.toMatchObject({ kind: 'not_found' });

    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        400,
        errorBody('invalid_request', 'limit must be between 1 and 100.', { field: 'limit' }),
      ),
    );
    await expect(listRealScoutContacts({ limit: 900 })).rejects.toMatchObject({
      kind: 'invalid_request',
      field: 'limit',
    });
  });
});

describe('rate limiting', () => {
  it('waits the Retry-After and retries rather than hammering', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(429, errorBody('rate_limited', 'Try again in 0 seconds.'), {
          'Retry-After': '0',
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: [], has_more: false }));

    const page = await listRealScoutContacts();

    expect(page.data).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports instead of sleeping when Retry-After is longer than a run should hold', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, errorBody('rate_limited', 'Try again in 300 seconds.'), {
        'Retry-After': '300',
      }),
    );

    const started = Date.now();
    await expect(listRealScoutContacts()).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterSeconds: 300,
    });

    // One call and no wait: a five-minute sleep inside a function invocation
    // reports nothing at all, where an error names the condition.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('gives up after the attempt limit rather than looping', async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse(429, errorBody('rate_limited', 'slow down'), { 'Retry-After': '0' }),
    );

    await expect(listRealScoutContacts()).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('pagination', () => {
  it('follows next_cursor and stops when has_more is false', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [{ id: 'c1' }],
          has_more: true,
          next_cursor: 'cursor-2',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { data: [{ id: 'c2' }], has_more: false, next_cursor: null }),
      );

    const ids: string[] = [];
    for await (const page of pagesOfRealScoutContacts({ updated_after: 'x' }, 10)) {
      ids.push(...page.data.map((contact) => contact.id));
    }

    expect(ids).toEqual(['c1', 'c2']);
    expect(calledUrl(0)).toContain('limit=100');
    expect(calledUrl(1)).toContain('cursor=cursor-2');
  });

  it('stops at maxPages so one invocation cannot page forever', async () => {
    // A fresh Response per call: a body can only be read once, so handing the
    // same object back twice would look like an empty second page.
    fetchMock.mockImplementation(() =>
      jsonResponse(200, { data: [{ id: 'c' }], has_more: true, next_cursor: 'more' }),
    );

    let pages = 0;
    for await (const _page of pagesOfRealScoutContacts({}, 3)) pages++;

    expect(pages).toBe(3);
  });
});

describe('createRealScoutContact', () => {
  const input = {
    email: 'nora@example.com',
    price_status_alerts_enabled: false,
    exclusives_alerts_enabled: false,
  };

  it('reports `created` for a 201, flagging that it may have revived a deletion', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { contact: { id: 'VXNlci0x' } }));

    await expect(createRealScoutContact(input)).resolves.toEqual({
      status: 'created',
      contact: { id: 'VXNlci0x' },
    });
  });

  it('reports `exists` for the documented 400 on an address a live contact holds', async () => {
    // The spec: "An email a live contact already has is refused on email."
    // Treating that as a failure would log an error on every repeat visitor.
    fetchMock.mockResolvedValue(
      jsonResponse(
        400,
        errorBody('invalid_request', 'email has already been taken.', { field: 'email' }),
      ),
    );

    await expect(createRealScoutContact(input)).resolves.toMatchObject({
      status: 'exists',
    });
  });

  it('still throws for a 400 about anything other than the email', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        400,
        errorBody('invalid_request', 'contact_type is not valid.', {
          field: 'contact_type',
        }),
      ),
    );

    await expect(createRealScoutContact(input)).rejects.toMatchObject({
      kind: 'invalid_request',
      field: 'contact_type',
    });
  });
});

describe('probeRealScout — the connectivity check', () => {
  it('reports the scopes /me carries and whether the push direction can work', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: 'QWdlbnQtMjcyNDY1',
          full_name: 'Joey O.',
          brokerage_name: 'eXp Realty',
          scopes: ['account:read', 'contacts:read', 'contacts:write'],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: [], has_more: false }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [], has_more: false }));

    const report = await probeRealScout();

    expect(report.configured).toBe(true);
    expect(report.scopes).toEqual(['account:read', 'contacts:read', 'contacts:write']);
    expect(report.canWriteContacts).toBe(true);
    expect(report.account).toEqual({
      id: 'QWdlbnQtMjcyNDY1',
      name: 'Joey O.',
      brokerage: 'eXp Realty',
    });
    expect(report.probes.map((probe) => probe.reachable)).toEqual([true, true, true]);
  });

  it('probes all three even when the first fails, and names the missing scope', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          403,
          errorBody(
            'missing_scope',
            'This call requires the account:read scope, which this credential was not granted.',
          ),
        ),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: [], has_more: false }))
      .mockResolvedValueOnce(
        jsonResponse(
          403,
          errorBody(
            'missing_scope',
            'This call requires the contacts:read scope, which this credential was not granted.',
          ),
        ),
      );

    const report = await probeRealScout();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(report.probes[0]).toMatchObject({
      target: 'me',
      reachable: false,
      status: 403,
      reason: 'scope',
      missingScope: 'account:read',
    });
    expect(report.probes[1]).toMatchObject({ target: 'contacts', reachable: true });
    expect(report.probes[2]).toMatchObject({
      target: 'activity',
      reachable: false,
      reason: 'scope',
      missingScope: 'contacts:read',
    });
    // /me did not answer, so the scopes are unknown rather than empty.
    expect(report.scopes).toBeNull();
    expect(report.canWriteContacts).toBeNull();
  });

  it('says `unconfigured` without calling RealScout when there is no token', async () => {
    delete testEnv.REALSCOUT_API_TOKEN;

    const report = await probeRealScout();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(report.configured).toBe(false);
    expect(report.probes.map((probe) => probe.reason)).toEqual([
      'unconfigured',
      'unconfigured',
      'unconfigured',
    ]);
  });

  it('never puts the token in the report', async () => {
    fetchMock.mockImplementation(() =>
      jsonResponse(401, errorBody('unauthorized', 'Invalid or missing credentials.')),
    );

    const report = await probeRealScout();

    expect(JSON.stringify(report)).not.toContain(TOKEN);
    expect(report.probes.every((probe) => probe.reason === 'auth')).toBe(true);
  });

  it('does not put a request URL in a transport failure, because a URL can carry an email', async () => {
    fetchMock.mockRejectedValue(
      new Error(`fetch failed for ${REALSCOUT_BASE_URL}/contacts?email=dana@example.com`),
    );

    const error = await listRealScoutContacts({ email: 'dana@example.com' }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toMatchObject({ kind: 'network' });
    expect((error as Error).message).not.toContain('dana@example.com');
  });
});

describe('missingScopeFrom', () => {
  it('lifts a scope name out of the documented message shape', () => {
    expect(
      missingScopeFrom(
        'This call requires the listing_alerts:read scope, which this credential was not granted.',
      ),
    ).toBe('listing_alerts:read');
  });

  it('returns null rather than inventing a name', () => {
    expect(missingScopeFrom('Forbidden')).toBeNull();
  });
});
