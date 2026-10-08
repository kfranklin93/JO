/**
 * Where to send someone who wants to book time with Joey.
 *
 * ## Why this is not just `env.CALENDLY_LINK`
 *
 * Two problems with how that was read before.
 *
 * The name was a lie waiting to happen. Any scheduling tool that produces a URL
 * works here — a Google Calendar appointment page, Cal.com, Calendly — and the
 * variable named one vendor, so the first time Joey used a different one the
 * configuration would have read as nonsense to whoever came next.
 *
 * Worse, two call sites defaulted an absent value to the literal
 * `https://calendly.com/joey`, a URL nobody owns. So a deployment that had
 * simply never configured a booking link put a dead link into every follow-up
 * email signature and every SMS. A dead booking link is worse than no booking
 * link: it costs the click and the trust, and nobody notices because nothing
 * errors.
 *
 * So: one resolver, no fabricated fallback. Absent means absent, and every
 * caller is responsible for saying nothing rather than saying something broken.
 *
 * ## Migration
 *
 * `BOOKING_LINK` is the name to use. `CALENDLY_LINK` still works and is read as
 * a fallback, so a deploy that lands before the Netlify variable is renamed does
 * not silently lose the link. Once `BOOKING_LINK` is set everywhere, the old
 * variable can be deleted from the environment and then from `env.ts`.
 */

import { env } from '@/config/env';

/**
 * The configured booking URL, or undefined when there is none.
 *
 * Prefers `BOOKING_LINK`. Falls back to the deprecated `CALENDLY_LINK` so the
 * rename can happen in either order — code first or configuration first —
 * without a window where the link disappears.
 *
 * Both are validated as URLs by the env schema, so a non-empty value here is
 * always a parseable URL. A blank string is treated as absent: Netlify stores a
 * cleared variable as an empty string, and an empty `href` is a link to the
 * current page, which looks like a broken button rather than a missing one.
 */
export function bookingLink(): string | undefined {
  const configured = env.BOOKING_LINK ?? env.CALENDLY_LINK;
  const trimmed = configured?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * A one-line invitation to book, or an empty string when no link is configured.
 *
 * Returning the whole line rather than just the URL keeps the "is there a link?"
 * decision in one place instead of repeating the conditional in the email
 * signature and the SMS body — which is exactly where the fabricated fallback
 * got in last time.
 *
 * The leading separator is the caller's business; this returns only the line.
 */
export function bookingLine(): string {
  const link = bookingLink();
  return link ? `📅 Book a call: ${link}` : '';
}
