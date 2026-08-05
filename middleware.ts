import { NextRequest, NextResponse } from 'next/server';

// The cookie value set by /api/auth/login on successful authentication.
// Middleware only checks for this token — password validation happens
// entirely in the API route where process.env is reliably available.
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

export const config = {
  matcher: ['/dashboard/:path*'],
};
