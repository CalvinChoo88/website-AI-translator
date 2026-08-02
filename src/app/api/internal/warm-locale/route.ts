import { NextRequest, NextResponse } from "next/server";
import { verifyInternalSecret, INTERNAL_SECRET_HEADER } from "@/lib/warm/internalAuth";
import { processWarmBatch } from "@/lib/warm/run";

/**
 * Internal-only: processes one batch of a background crawl-and-translate
 * run started by triggerWarmIfNeeded, then schedules its own
 * continuation until the run is done. Never called by the widget or
 * any merchant-facing surface — guarded by a shared secret instead of
 * a shopper/merchant session since there isn't one in this context.
 */
export async function POST(req: NextRequest) {
  if (!verifyInternalSecret(req.headers.get(INTERNAL_SECRET_HEADER))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { localeWarmId?: string };
  try {
    body = (await req.json()) as { localeWarmId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.localeWarmId) {
    return NextResponse.json({ error: "Missing localeWarmId" }, { status: 400 });
  }

  try {
    await processWarmBatch(body.localeWarmId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/internal/warm-locale]", err);
    return NextResponse.json({ error: "Batch failed" }, { status: 500 });
  }
}
