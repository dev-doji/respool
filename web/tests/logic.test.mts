// Run with: npm test (inside web/). Uses Node's built-in test runner; no extra dependencies.
// The receipt fixture is a real approval from Unichain Sepolia (block 68152141): 5 test USDC for the vault.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { amountFromReceipt, stateFromReceipt, type Receipt } from "../lib/receipt.ts";
import { expectedAfter, reflects, settledPosition, type Pos } from "../lib/positionWait.ts";

const who = {
  account: "0x2f85930757A742A480AC1196fcD42a952077968a",
  vault: "0x69F358fA4D98EC89C243F634ffDd2135f7165FfB",
  usdc: "0x31d0220469e10c4E71834a79b1f276d740d3768F",
};
const real = (JSON.parse(readFileSync(new URL("./fixtures/unichain-approve-receipt.json", import.meta.url), "utf8")) as { result: Receipt }).result;

const pad = (a: string) => "0x000000000000000000000000" + a.slice(2).toLowerCase();
const word = (n: bigint) => "0x" + n.toString(16).padStart(64, "0");
const ZERO = "0x" + "0".repeat(40);
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

test("a real approval receipt decodes to 5 USDC and is confirmed", () => {
  assert.equal(amountFromReceipt("approve", real, who), 5_000_000n);
  assert.equal(stateFromReceipt(real), "confirmed");
});

test("a receipt is only read as the kind of action it really is", () => {
  assert.equal(amountFromReceipt("deposit", real, who), undefined);
  assert.equal(amountFromReceipt("withdraw", real, who), undefined);
  assert.equal(amountFromReceipt("approve", real, { ...who, account: "0x0000000000000000000000000000000000000001" }), undefined);
});

test("pending and failed receipts map to checking and failed", () => {
  assert.equal(stateFromReceipt(null), "checking");
  assert.equal(stateFromReceipt({ ...real, status: "0x0" }), "failed");
});

test("deposit and withdraw receipts decode from the vault's share mint and burn", () => {
  const deposit: Receipt = { status: "0x1", blockNumber: "0x1", logs: [{ address: who.vault, topics: [TRANSFER, pad(ZERO), pad(who.account)], data: word(7_000_000n) }] };
  const withdraw: Receipt = { status: "0x1", blockNumber: "0x2", logs: [{ address: who.vault, topics: [TRANSFER, pad(who.account), pad(ZERO)], data: word(3_000_000n) }] };
  assert.equal(amountFromReceipt("deposit", deposit, who), 7_000_000n);
  assert.equal(amountFromReceipt("withdraw", withdraw, who), 3_000_000n);
  assert.equal(amountFromReceipt("deposit", withdraw, who), undefined);
});

const before: Pos = { usdc: 20_000_000n, shares: 0n, allowance: 0n };

test("expectedAfter describes each action's effect on the balances", () => {
  assert.deepEqual(expectedAfter("approve", before, 5_000_000n), { usdc: 20_000_000n, shares: 0n, allowance: 5_000_000n });
  assert.deepEqual(expectedAfter("deposit", { ...before, allowance: 5_000_000n }, 5_000_000n), { usdc: 15_000_000n, shares: 5_000_000n, allowance: 0n });
  assert.deepEqual(expectedAfter("redeem", { usdc: 15_000_000n, shares: 5_000_000n, allowance: 0n }, 2_000_000n), { usdc: 17_000_000n, shares: 3_000_000n, allowance: 0n });
});

test("a stale read does not count as reflecting the transaction, a fresh one does", () => {
  const expected = expectedAfter("approve", before, 5_000_000n);
  assert.equal(reflects("approve", before, expected), false);
  assert.equal(reflects("approve", { ...before, allowance: 5_000_000n }, expected), true);
});

test("settledPosition waits through stale reads until the chain catches up", async () => {
  let reads = 0, sleeps = 0;
  const out = await settledPosition({
    kind: "approve", before, amount: 5_000_000n, sleep: async () => { sleeps++; },
    read: async () => (++reads <= 3 ? before : { ...before, allowance: 5_000_000n }),
  });
  assert.equal(out.confirmed, true);
  assert.equal(out.position.allowance, 5_000_000n);
  assert.equal(reads, 4);
  assert.equal(sleeps, 3);
});

test("settledPosition falls back to the expected balances when the node never catches up", async () => {
  let reads = 0;
  const out = await settledPosition({ kind: "approve", before, amount: 5_000_000n, tries: 4, sleep: async () => {}, read: async () => { reads++; return before; } });
  assert.equal(out.confirmed, false);
  assert.equal(out.position.allowance, 5_000_000n);
  assert.equal(reads, 4);
});

test("settledPosition treats a failing read as not-yet, not as fatal", async () => {
  let reads = 0;
  const out = await settledPosition({
    kind: "deposit", before: { ...before, allowance: 5_000_000n }, amount: 5_000_000n, tries: 6, sleep: async () => {},
    read: async () => { if (++reads < 3) throw new Error("rpc down"); return { usdc: 15_000_000n, shares: 5_000_000n, allowance: 0n }; },
  });
  assert.equal(out.confirmed, true);
  assert.equal(out.position.shares, 5_000_000n);
});

test("funds on another chain are pointed out; funds on the viewed chain or none are not", async () => {
  const { fundsElsewhere } = await import("../lib/funds.ts");
  const rows = [{ id: 1301, wallet: 0n, vault: 5_000_000n }, { id: 84532, wallet: 9n, vault: 0n }];
  assert.equal(fundsElsewhere(rows, 84532)?.id, 1301);
  assert.equal(fundsElsewhere(rows, 1301), undefined);
  assert.equal(fundsElsewhere([{ id: 1301, wallet: 1n, vault: 0n }, { id: 84532, wallet: 1n, vault: 0n }], 84532), undefined);
});

test("waiting time reads in plain words and flips to slow after 10 minutes", async () => {
  const { waitedText, moveWaitState } = await import("../lib/moves.ts");
  assert.equal(waitedText(45_000), "45 s");
  assert.equal(waitedText(5 * 60_000), "5 min");
  assert.equal(waitedText(80 * 60_000), "1 h 20 min");
  assert.equal(moveWaitState(9 * 60_000), "waiting");
  assert.equal(moveWaitState(25 * 60_000), "slow");
});
