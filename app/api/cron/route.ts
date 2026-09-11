import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { processJob, schedule } from '@/lib/ai';
import { runLocalScheduler } from '@/lib/local-scheduler';
import { isDemo, isStandalone } from '@/lib/demo';
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
    // La demo non chiama mai Gemini davvero: nessuna automazione da eseguire.
    if (isDemo()) return NextResponse.json({ processed: 0 });
    // Nessun Supabase collegato: usa lo scheduler locale sincrono (vedi lib/local-scheduler.ts).
    if (isStandalone()) {
      const result = await runLocalScheduler();
      return NextResponse.json(result);
    }
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
