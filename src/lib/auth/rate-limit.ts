/**
 * Best-effort rate limiting for dashboard login attempts.
 *
 * Failed attempts are counted per key inside a sliding window. Once a key passes
 * the threshold, the login route rejects further attempts with a 429 until the
 * oldest recorded failure ages out of the window.
 *
 * ## Per-instance, and therefore approximate
 *
 * The counter lives in a module-scoped `Map`, so it only covers the function
 * instance that happens to serve the request. Netlify scales functions
 * horizontally, which means an attacker spreading attempts across cold starts
 * gets more than the threshold implies — every fresh instance starts at zero.
 *
 * That is a real weakness and it is accepted deliberately. What this does stop
 * is naive scripted guessing against a warm instance, which is the realistic
 * threat against a single-operator dashboard. It is not a strong control.
 *
 * The follow-up that would make it one is a `login_attempts` table: insert a row
 * per failure, count the rows inside the window, and every instance then shares
 * a single view of the truth. That is out of scope for this spec, and this
 * module is the seam it would drop into — the counter functions below keep their
 * shape, and only the storage changes (to async, at that point).
 */

/** Failed attempts permitted per key inside one window before requests are refused. */
export const MAX_FAILED_ATTEMPTS = 5;

/**
 * Sliding window length.
 *
 * Fifteen minutes against five attempts is slow enough to make scripted guessing
 * pointless while leaving an operator who mistypes a couple of times unaffected.
 * A successful login calls `clearFailures`, so the only person who ever waits is
 * one who cannot produce the password at all.
 */
export const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

/**
 * Bucket used when a request carries no usable client IP.
 *
 * Shared on purpose. Giving each header-less request a private bucket would mean
 * stripping the forwarded headers bypasses the limiter entirely, so they all
 * contend for the same allowance instead.
 */
export const SHARED_FALLBACK_KEY = 'shared:no-client-ip';

/** Window length in milliseconds, the unit the recorded timestamps use. */
const WINDOW_MS = RATE_LIMIT_WINDOW_SECONDS * 1000;

/**
 * Map size that triggers a sweep of aged-out keys.
 *
 * Keys come from client IPs, so the number of them is set by whoever is sending
 * requests, not by this process. Without a sweep, a long-lived warm instance
 * would hold a bucket for every address it has ever seen.
 */
const SWEEP_AFTER_KEYS = 1000;

/**
 * Client IP headers in order of how much they can be trusted.
 *
 * `x-nf-client-connection-ip` comes first because it is the one Netlify sets
 * itself and the only one it commits to keeping
 * ([Netlify support](https://answers.netlify.com/t/is-the-client-ip-header-going-to-be-supported-long-term/11203)).
 * `x-forwarded-for` comes last: a client can send its own, and proxies append
 * rather than replace, so its leading entry is client-influenceable. That is a
 * further reason this limiter is described as best-effort rather than a control.
 */
const CLIENT_IP_HEADERS = [
  'x-nf-client-connection-ip',
  'x-real-ip',
  'x-forwarded-for',
] as const;

/** Failure timestamps in unix milliseconds, newest last, keyed by client. */
const failures = new Map<string, number[]>();

/** Outcome of a rate-limit check. `retryAfterSeconds` is present only when refused. */
export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/** Anything that can read a header by name: `Request.headers` or `next/headers`. */
type HeaderReader = Pick<Headers, 'get'>;

/**
 * Failure timestamps for a key that still fall inside the window.
 *
 * Pruning happens on access rather than on a timer, so an idle key costs
 * nothing. The pruned bucket is written back — or dropped when it empties — so
 * the same filtering is not repeated on every subsequent call.
 *
 * A failure exactly `WINDOW_MS` old counts as aged out, matching the strict
 * comparison the session module uses for expiry.
 */
function withinWindow(key: string, now: number): number[] {
  const recorded = failures.get(key);
  if (recorded === undefined) return [];

  const cutoff = now - WINDOW_MS;
  const recent = recorded.filter((timestamp) => timestamp > cutoff);

  if (recent.length === 0) failures.delete(key);
  else if (recent.length !== recorded.length) failures.set(key, recent);

  return recent;
}

/** Drop every key whose most recent failure has aged out of the window. */
function sweep(now: number): void {
  const cutoff = now - WINDOW_MS;

  for (const [key, timestamps] of failures) {
    const newest = timestamps[timestamps.length - 1];
    if (newest === undefined || newest <= cutoff) failures.delete(key);
  }
}

/** Take the leading entry of a possibly comma-joined proxy header. */
function firstHeaderValue(value: string | null): string | undefined {
  if (!value) return undefined;
  const first = value.split(',')[0]?.trim();
  return first ? first : undefined;
}

/**
 * Whether an attempt from this key is currently permitted.
 *
 * Call this before comparing the password. Checking after the comparison would
 * make it a delay rather than a limit.
 *
 * @param key - Usually the value from {@link rateLimitKey}.
 * @returns `{ allowed: true }`, or `{ allowed: false, retryAfterSeconds }` where
 *   the wait is long enough for the oldest failure to leave the window.
 *
 * @example
 * const key = rateLimitKey(request.headers);
 * const limit = checkRateLimit(key);
 * if (!limit.allowed) {
 *   return NextResponse.json({ error: 'Too many attempts' }, {
 *     status: 429,
 *     headers: { 'Retry-After': String(limit.retryAfterSeconds) },
 *   });
 * }
 */
export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const recent = withinWindow(key, now);

  if (recent.length < MAX_FAILED_ATTEMPTS) return { allowed: true };

  // Timestamps are appended in order, so index 0 is the oldest, and it is the
  // one whose departure from the window drops the count below the threshold.
  const oldest = recent[0] ?? now;

  // At least a second, so `Retry-After: 0` never tells a client to retry
  // immediately into another refusal.
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((oldest + WINDOW_MS - now) / 1000),
  );

  return { allowed: false, retryAfterSeconds };
}

/**
 * Record one failed attempt against a key.
 *
 * @param key - Usually the value from {@link rateLimitKey}.
 */
export function recordFailure(key: string): void {
  const now = Date.now();
  const recent = withinWindow(key, now);

  recent.push(now);

  // Only the newest `MAX_FAILED_ATTEMPTS` timestamps affect the decision, so the
  // rest are discarded. This bounds the array during a sustained attack, and it
  // means someone who keeps hammering keeps pushing their own retry time out.
  failures.set(key, recent.slice(-MAX_FAILED_ATTEMPTS));

  if (failures.size > SWEEP_AFTER_KEYS) sweep(now);
}

/**
 * Forget every recorded failure for a key.
 *
 * Called after a successful login, so an operator who mistyped on the way in is
 * not left sitting near the threshold for the rest of the window.
 *
 * @param key - Usually the value from {@link rateLimitKey}.
 */
export function clearFailures(key: string): void {
  failures.delete(key);
}

/**
 * Derive the rate-limit key for a request from its client IP.
 *
 * Falls back to {@link SHARED_FALLBACK_KEY} when no IP header is present, which
 * keeps header-stripping from being a free bypass.
 *
 * @param headers - The request's headers.
 * @returns The client IP, or the shared fallback key.
 *
 * @example
 * rateLimitKey(request.headers); // => '203.0.113.7'
 */
export function rateLimitKey(headers: HeaderReader): string {
  for (const header of CLIENT_IP_HEADERS) {
    const value = firstHeaderValue(headers.get(header));
    if (value !== undefined) return value;
  }

  return SHARED_FALLBACK_KEY;
}
