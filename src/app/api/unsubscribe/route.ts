/**
 * Unsubscribe endpoint. This exact URL is what `List-Unsubscribe` points at.
 *
 * It answers two callers with different needs:
 *
 *  - **POST** — Gmail and Outlook's one-click control (RFC 8058). They send a
 *    form body of `List-Unsubscribe=One-Click` and expect a plain 2xx. No UI,
 *    no redirect, no confirmation; the mailbox provider shows its own.
 *  - **GET** — a human clicking the footer link. This does NOT suppress. It
 *    redirects to a page with a confirm button, because mail clients and
 *    security scanners prefetch links, and a mutating GET would unsubscribe
 *    people who never clicked anything. The confirm button posts back here.
 *
 * Both paths are unauthenticated by design: the recipient is not a user of
 * anything and must not need an account to get out of a mailing list. What
 * stands in for authentication is the signed token, which names the address and
 * cannot be edited to name somebody else. See src/lib/auth/unsubscribe-token.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/config/env';
import { readUnsubscribeToken } from '@/lib/auth/unsubscribe-token';
import { suppress } from '@/lib/services/email-preferences';

/** Read the token from the query string or a posted form field. */
async function tokenFrom(req: NextRequest): Promise<string | undefined> {
  const fromQuery = req.nextUrl.searchParams.get('token');
  if (fromQuery) return fromQuery;

  // The confirm page posts the token as a form field.
  try {
    const form = await req.formData();
    const value = form.get('token');
    return typeof value === 'string' && value ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest) {
  // Whether this came from our own confirm page rather than a mailbox
  // provider's one-click. Decided before the body is consumed, because reading
  // formData twice is not possible.
  const wantsRedirect = req.nextUrl.searchParams.get('redirect') === '1';

  const token = await tokenFrom(req);
  const email = readUnsubscribeToken(token);

  if (!email) {
    // Deliberately vague and the same for every kind of bad token. A caller
    // does not need to know whether it was malformed, tampered with, or signed
    // by a different deployment.
    if (wantsRedirect) {
      return NextResponse.redirect(
        new URL('/unsubscribe?status=invalid', env.NEXT_PUBLIC_SITE_URL),
        303,
      );
    }
    return NextResponse.json({ error: 'Invalid unsubscribe link' }, { status: 400 });
  }

  try {
    // `suppress` is idempotent, which matters here: Gmail may issue the
    // one-click POST more than once for a single user action.
    await suppress(email, wantsRedirect ? 'link' : 'one_click');
  } catch (err) {
    console.error('[unsubscribe] could not record the opt-out:', err);

    // Reported honestly rather than showing a confirmation for something that
    // did not happen — if this says "you're unsubscribed" and the write failed,
    // the next email is a spam report.
    if (wantsRedirect) {
      return NextResponse.redirect(
        new URL('/unsubscribe?status=error', env.NEXT_PUBLIC_SITE_URL),
        303,
      );
    }
    return NextResponse.json({ error: 'Could not process unsubscribe' }, { status: 500 });
  }

  console.log(`[unsubscribe] ${email} opted out via ${wantsRedirect ? 'link' : 'one-click'}`);

  if (wantsRedirect) {
    return NextResponse.redirect(
      new URL('/unsubscribe?status=done', env.NEXT_PUBLIC_SITE_URL),
      303,
    );
  }

  // RFC 8058 wants a plain success. Body text is for humans reading logs.
  return new NextResponse('Unsubscribed', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');

  // No suppression here — see the module note on prefetching. The page decides
  // what to show; an absent or bad token simply lands on the invalid state.
  const target = new URL('/unsubscribe', env.NEXT_PUBLIC_SITE_URL);
  if (token) target.searchParams.set('token', token);

  return NextResponse.redirect(target, 303);
}
