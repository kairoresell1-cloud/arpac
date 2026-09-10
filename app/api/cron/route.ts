import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { processJob, schedule } from '@/lib/ai';
export const maxDuration = 300;
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    got.length !== expected.length ||
    !timingSafeEqual(Buffer.from(got), Buffer.from(expected))
  )
    return NextResponse.json({ error: 'Non autorizzato.' }, { status: 401 });
  try {
    await schedule();
    let n = 0;
    while (n < 3 && (await processJob())) n++;
    return NextResponse.json({ processed: n });
  } catch {
    return NextResponse.json(
      { error: 'Scheduler temporaneamente non disponibile.' },
      { status: 503 },
    );
  }
}
