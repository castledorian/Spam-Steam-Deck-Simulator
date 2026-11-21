import { timingSafeEqual } from "node:crypto";
import { runSync, syncStatus } from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const runtime = "nodejs";

export async function GET() {
  return Response.json(syncStatus(), { headers: { "cache-control": "no-store" } });
}

function authorized(request: Request): boolean {
  const secret = process.env.SPAM_SYNC_SECRET;
  if (!secret || secret.length < 32) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!process.env.SPAM_SYNC_SECRET || process.env.SPAM_SYNC_SECRET.length < 32) {
    return Response.json({ ok: false, message: "Synchronisation désactivée : SPAM_SYNC_SECRET doit être configuré (32 caractères minimum)." }, { status: 503 });
  }
  if (!authorized(request)) {
    return Response.json({ ok: false, message: "Non autorisé" }, { status: 401 });
  }
  const result = await runSync();
  return Response.json(
    { ok: result.ok, message: result.message, fetchedAt: result.snapshot?.fetchedAt, version: result.snapshot?.gameVersion },
    { status: result.ok ? 200 : 409, headers: { "cache-control": "no-store" } },
  );
}
