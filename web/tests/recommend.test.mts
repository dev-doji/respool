import assert from "node:assert/strict";
import test from "node:test";
import { decayedActivity, recommend } from "../lib/recommend.ts";

const swaps = (n: number) => BigInt(Math.round(n * 1e18));

test("activity fades with the blocks since it was recorded, like the brain's own rule", () => {
  assert.equal(decayedActivity(swaps(4), 1000n, 1000n, 60), 4);
  assert.equal(decayedActivity(swaps(4), 1000n, 1060n, 60), 2); // one half-life later: half
  assert.ok(decayedActivity(swaps(0.5287), 8350399n, 8656014n, 60) < 0.001); // the real brain state today: effectively zero
  assert.equal(decayedActivity(0n, 5n, 10n, 60), 0);
  assert.equal(decayedActivity(swaps(1), 0n, 10n, 60), 0); // never recorded
});

test("a chain is only recommended as the destination when clearly busier and above the noise floor", () => {
  const s = { ratio: 3, minHot: 2 };
  assert.deepEqual(recommend({ unichain: 6, base: 1 }, s), { from: "base", to: "unichain", hot: 6, cold: 1 });
  assert.deepEqual(recommend({ unichain: 1, base: 7 }, s), { from: "unichain", to: "base", hot: 7, cold: 1 });
  assert.equal(recommend({ unichain: 5, base: 2 }, s), null); // busier, but not 3x
  assert.equal(recommend({ unichain: 1.9, base: 0 }, s), null); // below the 2-swap floor
  assert.equal(recommend({ unichain: 0, base: 0 }, s), null);
  assert.equal(recommend({ unichain: 6, base: 2 }, s)?.to, "unichain"); // exactly 3x counts
});
