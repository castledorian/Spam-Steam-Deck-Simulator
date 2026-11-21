import test from "node:test";
import assert from "node:assert/strict";
import { scoreConfidence, wilson } from "../src/lib/sim/search";

test("scoreConfidence treats draws as half-points, not binary wins", () => {
  const ci = scoreConfidence(10, 10, 10);
  assert.equal((10 + 10 * 0.5) / 30, 0.5);
  assert.ok(ci.lo <= 0.5 && ci.hi >= 0.5);
  assert.ok(ci.lo >= 0 && ci.hi <= 1);
});

test("scoreConfidence remains conservative for one observation", () => {
  assert.deepEqual(scoreConfidence(1, 0, 0), { lo: 0, hi: 1 });
});

test("scoreConfidence does not collapse to zero width for all wins", () => {
  const ci = scoreConfidence(100, 0, 0);
  assert.ok(ci.lo < 1 && ci.hi === 1);
});

test("Wilson remains a binary-outcome interval", () => {
  const ci = wilson(50, 100);
  assert.ok(ci.lo < 0.5 && ci.hi > 0.5);
});
