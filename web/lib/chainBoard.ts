// The chain board: for each supported testnet, how much Uniswap v4 trading happened recently and how thinly it is
// backed by liquidity, read from the chain's own PoolManager Swap events. Read-only; nothing here moves money.
//
// Testnet trading is mostly developers and bots, so the figures say where test activity is, not where real fees are.
import { rpc } from "./rpc.ts";

export interface BoardChain {
  key: string; name: string; id: number; rpc: string;
  /** Uniswap v4 PoolManager (from the official v4 deployments page, checked to have code on the chain). */
  poolManager: string;
  /** The most blocks one eth_getLogs call may span on this chain's public RPC (measured). */
  maxRange: number;
  /** Rough seconds per block, only to pick a block range for the time window. The real window is measured. */
  blockSec: number;
  /** What this app can do on the chain today. */
  vault: boolean; move: boolean;
}

export const BOARD_CHAINS: BoardChain[] = [
  { key: "base", name: "Base Sepolia", id: 84532, rpc: "https://sepolia.base.org", poolManager: "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408", maxRange: 200, blockSec: 0.2, vault: true, move: true },
  { key: "unichain", name: "Unichain Sepolia", id: 1301, rpc: "https://sepolia.unichain.org", poolManager: "0x00b036b58a818b1bc34d502d3fe730db729e62ac", maxRange: 1000, blockSec: 1, vault: true, move: true },
  { key: "arbitrum", name: "Arbitrum Sepolia", id: 421614, rpc: "https://sepolia-rollup.arbitrum.io/rpc", poolManager: "0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317", maxRange: 10000, blockSec: 0.25, vault: false, move: false },
  { key: "sepolia", name: "Ethereum Sepolia", id: 11155111, rpc: "https://ethereum-sepolia-rpc.publicnode.com", poolManager: "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543", maxRange: 10000, blockSec: 12, vault: false, move: false },
];

/** keccak256("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)") */
export const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";
export const WINDOW_SEC = 30 * 60;
/** A chain with too little trading in the first window is read again over this longer one. */
export const WIDE_WINDOW_SEC = 6 * 60 * 60;
export const MIN_SWAPS = 3;
/** At most this many eth_getLogs calls per chain per reading, so a fast chain with a small range limit reads a shorter window. */
const MAX_CALLS = 10;

export interface Swap { pool: string; amount1: bigint; sqrtPriceX96: bigint; liquidity: bigint; fee: number }

const TWO_256 = 1n << 256n;
const signed = (v: bigint) => (v >= 1n << 255n ? v - TWO_256 : v);
const wordAt = (data: string, i: number) => BigInt("0x" + data.slice(2 + i * 64, 66 + i * 64));

/** Decodes one PoolManager Swap log: data = amount0, amount1, sqrtPriceX96, liquidity, tick, fee. */
export function decodeSwap(log: { topics: string[]; data: string }): Swap {
  return {
    pool: log.topics[1].toLowerCase(),
    amount1: signed(wordAt(log.data, 1)),
    sqrtPriceX96: wordAt(log.data, 2),
    liquidity: wordAt(log.data, 3),
    fee: Number(wordAt(log.data, 5)),
  };
}

export interface ChainStats {
  chain: BoardChain;
  status: "ok" | "quiet" | "error";
  swaps: number;
  windowSec: number;
  swapsPerHour: number;
  /** The pool with the most swaps in the window, among pools that charge a fee. */
  poolId?: string;
  pools: number;
  liquidity?: bigint;
  feePct?: number;
  /** Estimated fees earned by $100 deposited in that pool for a day, if the window repeated. */
  per100PerDay?: number;
  error?: string;
}

/**
 * Fee income of a swap on a position worth V is about fee * volume * (V / L_pool) / V = fee * volume / pool value.
 * With sqrtP = sqrt(price), a pool's value in token1 is about 2 * L * sqrtP, and a swap's volume is about |amount1|,
 * so each swap earns depositors about fee * |amount1| / (2 * L * sqrtP) of their money. All are dimensionless ratios,
 * so pools on different chains can be compared without pricing the tokens.
 */
export function swapYield(s: Swap): number {
  const L = Number(s.liquidity);
  const sqrtP = Number(s.sqrtPriceX96) / 2 ** 96;
  if (!(L > 0) || !(sqrtP > 0)) return 0;
  const abs = s.amount1 < 0n ? -s.amount1 : s.amount1;
  return ((s.fee / 1e6) * Number(abs)) / (2 * L * sqrtP);
}

export function summarise(chain: BoardChain, swaps: Swap[], windowSec: number): ChainStats {
  const base: ChainStats = { chain, status: "quiet", swaps: swaps.length, windowSec, swapsPerHour: windowSec > 0 ? (swaps.length * 3600) / windowSec : 0, pools: 0 };
  const byPool = new Map<string, Swap[]>();
  for (const s of swaps) byPool.set(s.pool, [...(byPool.get(s.pool) ?? []), s]);
  base.pools = byPool.size;
  let best: Swap[] = [];
  // A pool whose fee is zero pays depositors nothing, however busy it is, so it is never the one compared.
  for (const list of byPool.values()) if (list[list.length - 1].fee > 0 && list.length > best.length) best = list;
  if (best.length < MIN_SWAPS || windowSec <= 0) return base;
  const last = best[best.length - 1];
  const earned = best.reduce((sum, s) => sum + swapYield(s), 0);
  return {
    ...base, status: "ok", poolId: last.pool, liquidity: last.liquidity, feePct: last.fee / 10_000,
    swapsPerHour: (best.length * 3600) / windowSec, per100PerDay: earned * (86_400 / windowSec) * 100,
  };
}

/** Best first. Chains with no usable reading go last. */
export function rank(stats: ChainStats[]): ChainStats[] {
  return [...stats].sort((a, b) => (b.per100PerDay ?? -1) - (a.per100PerDay ?? -1));
}

export function explainFallback(ranked: ChainStats[]): string {
  const top = ranked[0];
  if (!top || top.status !== "ok") return "No chain has enough recent testnet trading to compare right now. Check again in a few minutes.";
  const usable = ranked.find((r) => r.chain.vault && r.status === "ok");
  const where = top.chain.vault ? "You can deposit there in this app."
    : `This app cannot deposit or move there yet, so it is shown for comparison only.${usable ? ` The best you can use here is ${usable.chain.name}.` : ""}`;
  const quiet = ranked.filter((r) => r.status !== "ok").map((r) => r.chain.name);
  return `${top.chain.name} looks best right now: about ${top.swapsPerHour.toFixed(0)} swaps an hour in its busiest pool, which is thinly backed, so each deposited dollar would have earned the most test fees. ${where}${quiet.length ? ` ${quiet.join(" and ")} had too little trading to rank.` : ""} Testnet trading is mostly bots, so this shows where test activity is, not real earnings.`;
}

async function logsIn(chain: BoardChain, from: number, to: number) {
  const calls: Promise<{ topics: string[]; data: string }[]>[] = [];
  for (let start = from; start <= to; start += chain.maxRange) {
    const end = Math.min(to, start + chain.maxRange - 1);
    calls.push(rpc<{ topics: string[]; data: string }[]>(chain.rpc, "eth_getLogs", [{
      address: chain.poolManager, topics: [SWAP_TOPIC], fromBlock: "0x" + start.toString(16), toBlock: "0x" + end.toString(16),
    }], 15000));
  }
  return (await Promise.all(calls)).flat();
}

const stamp = async (chain: BoardChain, block: number) =>
  Number((await rpc<{ timestamp: string }>(chain.rpc, "eth_getBlockByNumber", ["0x" + block.toString(16), false])).timestamp);

async function readWindow(chain: BoardChain, head: number, seconds: number): Promise<{ stats: ChainStats; blocks: number }> {
  const blocks = Math.min(Math.ceil(seconds / chain.blockSec), chain.maxRange * MAX_CALLS - 1);
  const from = Math.max(0, head - blocks);
  const [logs, t0, t1] = await Promise.all([logsIn(chain, from, head), stamp(chain, from), stamp(chain, head)]);
  return { stats: summarise(chain, logs.map(decodeSwap), Math.max(1, t1 - t0)), blocks };
}

export async function readChain(chain: BoardChain): Promise<ChainStats> {
  try {
    const head = Number(await rpc<string>(chain.rpc, "eth_blockNumber"));
    const first = await readWindow(chain, head, WINDOW_SEC);
    if (first.stats.status === "ok") return first.stats;
    // Too quiet to rank over half an hour: look further back (as far as this chain's RPC lets one reading go).
    const wide = await readWindow(chain, head, WIDE_WINDOW_SEC);
    return wide.blocks > first.blocks ? wide.stats : first.stats;
  } catch (e) {
    return { chain, status: "error", swaps: 0, windowSec: 0, swapsPerHour: 0, pools: 0, error: e instanceof Error ? e.message : "unavailable" };
  }
}
