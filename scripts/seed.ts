import { writeFileSync } from "node:fs";
import { buildSnapshot } from "../src/lib/sync";
(async () => {
  const s = await buildSnapshot();
  writeFileSync("src/data/seed.json", JSON.stringify(s));
  console.log("cards", s.cards.length, "tox", s.tox.length, "talents", s.talents.length, "patches", s.patches.length, s.gameVersion, s.dataExtracted);
})();
