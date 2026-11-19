// The chain board's maths and decoding. Swap logs are built by hand in the exact layout of the Uniswap v4
// PoolManager Swap event (data = amount0, amount1, sqrtPriceX96, liquidity, tick, fee); no live chain is used.
import assert from "node:assert/strict";
import test from "node:test";
import { BOARD_CHAINS, decodeSwap, explainFallback, MIN_SWAPS, rank, summarise, swapYield, SWAP_TOPIC } from "../lib/chainBoard.ts";
import { keccak256, toHex } from "viem";

const w = (v: bigint) => (v < 0n ? (1n << 256n) + v : v).toString(16).padStart(64, "0");
const Q96 = 1n << 96n;
const log = (pool: string, a1: bigint, liq: bigint, fee = 3000, sqrt = Q96) => ({
  topics: [SWAP_TOPIC, pool, "0x" + "0".repeat(64)],
  data: "0x" + w(0n) + w(a1) + w(sqrt) + w(liq) + w(0n) + w(BigInt(fee)),
});
const POOL_A = "0x" + "aa".repeat(32), POOL_B = "0x" + "bb".repeat(32);
const [BASE, UNI] = BOARD_CHAINS;

test("the Swap topic is the hash of the v4 Swap event signature", () => {
  assert.equal(SWAP_TOPIC, keccak256(toHex("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)")));
});

test("decodeSwap reads negative amounts, price, liquidity and fee", () => {
  const s = decodeSwap(log(POOL_A, -500n, 10_000n, 500, Q96 * 2n));
  assert.equal(s.pool, POOL_A);
  assert.equal(s.amount1, -500n);
  assert.equal(s.sqrtPriceX96, Q96 * 2n);
  assert.equal(s.liquidity, 10_000n);
  assert.equal(s.fee, 500);
});

test("swapYield: fee * volume / (2 * L * sqrtP), the same for either swap direction", () => {
  // fee 0.3%, volume 1,000, L 100,000, sqrtP 1 -> 0.003 * 1000 / 200000
  const y = swapYield(decodeSwap(log(POOL_A, 1000n, 100_000n)));
  assert.ok(Math.abs(y - 0.003 * 1000 / 200_000) < 1e-12);
  assert.equal(swapYield(decodeSwap(log(POOL_A, -1000n, 100_000n))), y);
});

test("swapYield is zero when the pool had no liquidity", () => {
  assert.equal(swapYield(decodeSwap(log(POOL_A, 1000n, 0n))), 0);
});

test("a thinner pool with the same trading earns more per dollar", () => {
  const trade = (liq: bigint) => Array.from({ length: 5 }, () => decodeSwap(log(POOL_A, 1000n, liq)));
  const deep = summarise(BASE, trade(1_000_000n), 1800), thin = summarise(UNI, trade(10_000n), 1800);
  assert.ok(thin.per100PerDay! > deep.per100PerDay!);
  assert.equal(rank([deep, thin])[0], thin);
});

test("fewer than the minimum swaps in the busiest pool is 'quiet', not a number", () => {
  const few = Array.from({ length: MIN_SWAPS - 1 }, () => decodeSwap(log(POOL_A, 1000n, 10_000n)));
  const s = summarise(BASE, few, 1800);
  assert.equal(s.status, "quiet");
  assert.equal(s.per100PerDay, undefined);
});

test("only the busiest pool is used; swaps are scaled to per hour and per day", () => {
  const swaps = [
    ...Array.from({ length: 4 }, () => decodeSwap(log(POOL_A, 1000n, 100_000n))),
    ...Array.from({ length: 2 }, () => decodeSwap(log(POOL_B, 1000n, 1n))),
  ];
  const s = summarise(BASE, swaps, 1800);
  assert.equal(s.poolId, POOL_A);
  assert.equal(s.swapsPerHour, 8);
  assert.equal(s.pools, 2);
  assert.ok(Math.abs(s.per100PerDay! - 4 * (0.003 * 1000 / 200_000) * 48 * 100) < 1e-9);
});

test("rank puts unreadable and quiet chains last", () => {
  const ok = summarise(BASE, Array.from({ length: 4 }, () => decodeSwap(log(POOL_A, 1000n, 10_000n))), 1800);
  const quiet = summarise(UNI, [], 1800);
  assert.deepEqual(rank([quiet, ok]).map((r) => r.chain.key), ["base", "unichain"]);
});

test("the explanation names the best chain, says when the app cannot use it, and warns it is testnet", () => {
  const swaps = Array.from({ length: 4 }, () => decodeSwap(log(POOL_A, 1000n, 10_000n)));
  const arb = summarise(BOARD_CHAINS.find((c) => c.key === "arbitrum")!, swaps, 1800);
  const text = explainFallback(rank([arb, summarise(BASE, [], 1800)]));
  assert.match(text, /Arbitrum Sepolia looks best/);
  assert.match(text, /cannot deposit or move there yet/);
  assert.match(text, /Base Sepolia had too little trading/);
  assert.match(text, /not real earnings/);
});

test("no data at all gives a plain 'nothing to compare', never an invented winner", () => {
  assert.match(explainFallback(rank([summarise(BASE, [], 1800)])), /No chain has enough/);
});

test("a busy pool that charges no fee is skipped: it pays depositors nothing", () => {
  const swaps = [
    ...Array.from({ length: 9 }, () => decodeSwap(log(POOL_B, 1000n, 100_000n, 0))),
    ...Array.from({ length: 4 }, () => decodeSwap(log(POOL_A, 1000n, 100_000n, 3000))),
  ];
  const s = summarise(BASE, swaps, 1800);
  assert.equal(s.poolId, POOL_A);
  assert.equal(s.swapsPerHour, 8);
});

test("if every busy pool is fee-free the chain is 'quiet', not a zero bar", () => {
  const swaps = Array.from({ length: 9 }, () => decodeSwap(log(POOL_B, 1000n, 100_000n, 0)));
  assert.equal(summarise(BASE, swaps, 1800).status, "quiet");
});

test("when the top chain cannot be used here, the explanation names the best one that can", () => {
  const thin = Array.from({ length: 4 }, () => decodeSwap(log(POOL_A, 1000n, 1_000n)));
  const deep = Array.from({ length: 4 }, () => decodeSwap(log(POOL_A, 1000n, 1_000_000n)));
  const arb = summarise(BOARD_CHAINS.find((c) => c.key === "arbitrum")!, thin, 1800);
  const text = explainFallback(rank([arb, summarise(BASE, deep, 1800)]));
  assert.match(text, /The best you can use here is Base Sepolia/);
});
