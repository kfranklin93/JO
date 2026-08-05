import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Must match the AUTH_TOKEN constant in middleware.ts
const AUTH_TOKEN = 'joey_dashboard_authenticated';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return NextResponse.json({ error: 'Dashboard not configured' }, { status: 503 });
    }

    if (password !== adminPassword) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    // Set a fixed token — NOT the password itself — so the middleware
    // never needs to read process.env (which is unreliable in Edge Runtime).
    const cookieStore = await cookies();
    cookieStore.set('dashboard_auth', AUTH_TOKEN, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
