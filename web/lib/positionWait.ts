// After a transaction is confirmed, the node your wallet reads from can lag by a block or more and still return
// the OLD balances. This waits for the chain's numbers to catch up, and if they do not within the window, falls
// back to what the confirmed transaction must have produced, so the page never keeps showing stale numbers.
// Pure, with injectable read and sleep, so it can be tested without a wallet or a network.

export interface Pos { usdc: bigint; shares: bigint; allowance: bigint }
export type Kind = "approve" | "deposit" | "redeem";

/** What the balances must be once the transaction is in a block. */
export function expectedAfter(kind: Kind, before: Pos, amount: bigint): Pos {
  if (kind === "approve") return { ...before, allowance: amount };
  if (kind === "deposit") {
    return { usdc: before.usdc - amount, shares: before.shares + amount, allowance: before.allowance > amount ? before.allowance - amount : 0n };
  }
  return { usdc: before.usdc + amount, shares: before.shares - amount, allowance: before.allowance };
}

/** True when a read already shows the effect of the transaction. */
export function reflects(kind: Kind, read: Pos, expected: Pos): boolean {
  if (kind === "approve") return read.allowance === expected.allowance;
  if (kind === "deposit") return read.shares >= expected.shares;
  return read.shares <= expected.shares;
}

export interface SettleOptions {
  kind: Kind;
  before: Pos;
  amount: bigint;
  read: () => Promise<Pos>;
  sleep?: (ms: number) => Promise<void>;
  tries?: number;
  gapMs?: number;
}

export async function settledPosition(o: SettleOptions): Promise<{ position: Pos; confirmed: boolean }> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const tries = o.tries ?? 10, gap = o.gapMs ?? 1500;
  const expected = expectedAfter(o.kind, o.before, o.amount);
  for (let i = 0; i < tries; i++) {
    try {
      const p = await o.read();
      if (reflects(o.kind, p, expected)) return { position: p, confirmed: true };
    } catch {
      // A failed read is just another not-yet; keep waiting.
    }
    if (i < tries - 1) await sleep(gap);
  }
  return { position: expected, confirmed: false };
}
