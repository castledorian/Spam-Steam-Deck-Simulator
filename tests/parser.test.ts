import test from "node:test";
import assert from "node:assert/strict";
import { parseEffect } from "../src/lib/parse";

test("Choice abilities are explicitly marked as partially modeled", () => {
  const parsed = parseEffect([
    "Choice",
    "Deal 10 Fire damage",
    "--- or ---",
    "Deal 20 Water damage",
  ]);
  assert.equal(parsed.hits.length, 1);
  assert.equal(parsed.hits[0].min, 10);
  assert.ok(parsed.unsupported?.some((warning) => warning.includes("Choice")));
});
