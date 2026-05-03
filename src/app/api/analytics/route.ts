import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { message: 'Analytics endpoint placeholder.' },
    { status: 501 },
  );
}
