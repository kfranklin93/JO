/**
 * Unsubscribe confirmation.
 *
 * Four states, driven by the query string: confirm (a valid token, nothing done
 * yet), done, invalid, and error. A server component, so the token is verified
 * on the server and the address is never guessed at by the client.
 *
 * The confirm step exists because the footer link is a GET, and mail clients
 * and security scanners prefetch those. Suppressing on GET would unsubscribe
 * people who never clicked. Gmail users still get true one-click through the
 * `List-Unsubscribe-Post` header, which bypasses this page entirely.
 *
 * Not under the (marketing) route group on purpose: no header, no footer, and
 * no chat widget. Someone trying to leave a mailing list should not be sold to.
 */

import type { Metadata } from 'next';
import { readUnsubscribeToken } from '@/lib/auth/unsubscribe-token';

export const metadata: Metadata = {
  title: 'Unsubscribe',
  // Keep it out of search results; it is a transactional page.
  robots: { index: false, follow: false },
};

type Status = 'done' | 'invalid' | 'error';

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; status?: string }>;
}) {
  const { token, status } = await searchParams;

  const resolved: Status | 'confirm' =
    status === 'done' || status === 'invalid' || status === 'error'
      ? status
      : 'confirm';

  // Verified server-side. A tampered token cannot make this page display an
  // address it was not signed for.
  const email = resolved === 'confirm' ? readUnsubscribeToken(token) : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center bg-linen px-6 py-16">
      <div className="w-full max-w-md rounded-xl border border-navy/10 bg-white px-8 py-10 shadow-soft">
        {resolved === 'confirm' && email ? (
          <>
            <h1 className="font-serif text-2xl text-navy">
              Unsubscribe from emails?
            </h1>
            <p className="mt-3 font-sans text-sm text-stone">
              We&rsquo;ll stop sending market updates and follow-ups to{' '}
              <span className="font-medium text-navy">{email}</span>.
            </p>
            <p className="mt-2 font-sans text-sm text-stone">
              If you&rsquo;re working with Joey on something right now, he can still
              reply to you directly — this only stops the automatic emails.
            </p>

            <form
              method="post"
              action="/api/unsubscribe?redirect=1"
              className="mt-6"
            >
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                className="flex min-h-11 w-full items-center justify-center rounded-xl bg-cerulean px-5 py-3 font-sans text-sm font-medium text-white transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cerulean"
              >
                Yes, unsubscribe me
              </button>
            </form>

            <a
              href="/"
              className="mt-4 flex min-h-11 items-center justify-center font-sans text-sm text-stone underline transition-colors hover:text-navy"
            >
              No thanks, keep me subscribed
            </a>
          </>
        ) : null}

        {resolved === 'confirm' && !email ? (
          <>
            <h1 className="font-serif text-2xl text-navy">This link isn&rsquo;t valid</h1>
            <p className="mt-3 font-sans text-sm text-stone">
              It may have been altered on the way here. You can reply to any email
              from Joey and ask to be removed — that works just as well.
            </p>
          </>
        ) : null}

        {resolved === 'done' ? (
          <>
            <h1 className="font-serif text-2xl text-navy">You&rsquo;re unsubscribed</h1>
            <p className="mt-3 font-sans text-sm text-stone">
              You won&rsquo;t get any more automatic emails from us. If you ever want
              back on the list, just get in touch through the site.
            </p>
          </>
        ) : null}

        {resolved === 'invalid' ? (
          <>
            <h1 className="font-serif text-2xl text-navy">This link isn&rsquo;t valid</h1>
            <p className="mt-3 font-sans text-sm text-stone">
              You can reply to any email from Joey and ask to be removed — that
              works just as well.
            </p>
          </>
        ) : null}

        {resolved === 'error' ? (
          <>
            <h1 className="font-serif text-2xl text-navy">Something went wrong</h1>
            {/* Deliberately does not claim success. A false confirmation here is
                how someone ends up reporting the next email as spam. */}
            <p className="mt-3 font-sans text-sm text-stone">
              We couldn&rsquo;t record that just now, so you may still receive emails.
              Please try the link again, or reply to any email from Joey and
              he&rsquo;ll take you off the list himself.
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}
