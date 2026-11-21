import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// Database persistence is optional for local evaluation: without DATABASE_URL,
// the app serves the bundled seed snapshot and API persistence/sync will report
// unavailable. A real connection string enables snapshots and synchronization.
const databaseUrl = process.env.DATABASE_URL || "postgresql://localhost:5432/spam";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 1500 });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
