import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { message: 'AI chat endpoint placeholder.' },
    { status: 501 },
  );
}
