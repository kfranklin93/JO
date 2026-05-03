import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { message: 'Lofty sync endpoint placeholder.' },
    { status: 501 },
  );
}
