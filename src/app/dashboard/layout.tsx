import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE_NAME, verifySession } from '@/lib/auth/session';

/**
 * Layout for every authenticated dashboard route.
 *
 * This is the authorization boundary for page renders, and the second of the two
 * independent checks in this spec — the other is `/api/dashboard/data`. Neither
 * relies on the other, so a forged cookie has to get past both.
 *
 * What this replaces: a bare `<div>` with no check at all. `dashboard/page.tsx`
 * is a client component whose only protection was redirecting on a 401 from the
 * data endpoint, which is a UX affordance — the page shell rendered first, and
 * anyone could skip the redirect by reading the response themselves.
 *
 * Server components run in the Node.js runtime, which is what makes the signing
 * secret reliably readable here. Do not move this check into the request
 * interceptor: that layer may run on the CDN edge, where secret access is not
 * dependable, and it is documented there as a redirect affordance only.
 *
 * The login page deliberately lives outside this subtree, at
 * `src/app/(dashboard-login)/dashboard/login/page.tsx`. It still serves
 * `/dashboard/login`, but because a route group is not a URL segment it does not
 * inherit this layout — otherwise an unauthenticated visitor sent to the login
 * page would hit this check again and bounce between the two forever.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();

  if (!verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value)) {
    // Throws, so `children` is never rendered and no lead data reaches the
    // response on the way out.
    redirect('/dashboard/login');
  }

  return (
    <div className="min-h-screen bg-neutral-50 font-sans text-neutral-900">
      {children}
    </div>
  );
}
