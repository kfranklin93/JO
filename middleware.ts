import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /dashboard routes (not /dashboard/login or /api/auth/*)
  if (pathname.startsWith('/dashboard') && pathname !== '/dashboard/login') {
    const authCookie = request.cookies.get('dashboard_auth');
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword || authCookie?.value !== adminPassword) {
      const loginUrl = new URL('/dashboard/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
