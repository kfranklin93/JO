import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { message: 'AI follow-up endpoint placeholder.' },
    { status: 501 },
  );
}
