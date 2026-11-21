import { db } from "@/db";
import { sql } from "drizzle-orm";
import { latestSnapshot, syncStatus } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    const snapshot = await latestSnapshot();
    const ageMs = Math.max(0, Date.now() - new Date(snapshot.fetchedAt).getTime());
    const valid = Array.isArray(snapshot.cards) && snapshot.cards.length >= 4 &&
      new Set(snapshot.cards.map((card) => card.slug)).size === snapshot.cards.length &&
      Array.isArray(snapshot.tox) && Array.isArray(snapshot.talents);
    const healthy = valid && Number.isFinite(ageMs);
    return Response.json({
      ok: healthy,
      database: "ok",
      snapshot: { valid, cards: snapshot.cards.length, toxFamilies: snapshot.tox.length, gameVersion: snapshot.gameVersion, fetchedAt: snapshot.fetchedAt, ageMs },
      sync: syncStatus(),
    }, { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, database: "error", message: error instanceof Error ? error.message : String(error) }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
