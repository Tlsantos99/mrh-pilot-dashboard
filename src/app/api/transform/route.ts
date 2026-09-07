import { NextResponse } from 'next/server';
import { transformOccurrences, syncAgentsFromStaging } from '@/lib/transform/occurrences';

export async function POST() {
  try {
    await syncAgentsFromStaging();
    const result = await transformOccurrences();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
