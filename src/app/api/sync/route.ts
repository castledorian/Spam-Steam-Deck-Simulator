import { runSync, syncStatus } from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  return Response.json(syncStatus());
}

export async function POST() {
  const r = await runSync();
  return Response.json({ ok: r.ok, message: r.message, fetchedAt: r.snapshot?.fetchedAt, version: r.snapshot?.gameVersion }, { status: r.ok ? 200 : 409 });
}
