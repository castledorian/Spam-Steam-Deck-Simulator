import { snapshotWithRefresh, syncStatus } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const snap = await snapshotWithRefresh();
  return new Response(JSON.stringify({ snapshot: snap, sync: syncStatus() }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
