import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import type { Snapshot } from "@/lib/types";

export const snapshots = pgTable("snapshots", {
  id: serial("id").primaryKey(),
  gameVersion: text("game_version").notNull(),
  cardCount: integer("card_count").notNull().default(0),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  data: jsonb("data").$type<Snapshot>().notNull(),
});
