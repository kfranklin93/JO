import { NextRequest, NextResponse } from 'next/server';

export function middleware(_request: NextRequest) {
  // Auth temporarily disabled — re-enable by restoring the token check below
  return NextResponse.next();
}

/*
const AUTH_TOKEN = 'joey_dashboard_authenticated';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/dashboard') && pathname !== '/dashboard/login') {
    const authCookie = request.cookies.get('dashboard_auth');

    if (authCookie?.value !== AUTH_TOKEN) {
      const loginUrl = new URL('/dashboard/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}
*/

export const config = {
  matcher: ['/dashboard/:path*'],
};
