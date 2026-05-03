import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { message: 'Lead capture endpoint placeholder.' },
    { status: 501 },
  );
}
