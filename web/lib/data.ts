// Typed view of lib/data.json, which scripts/build-data.mjs generates from the repo's deployments/ and results/.
import raw from "./data.json";

export type ChainKey = "base" | "unichain" | "lasna";

export interface Stats { n: number; median: number; p95: number; min: number; max: number }

export interface Batch {
  id: string; label: string; note: string; current: boolean;
  recentreBase: Stats | null; recentreUnichain: Stats | null; moves: Stats | null;
  movesIntoBase: number; movesIntoUnichain: number; topups: number;
}

export interface Loop {
  i: number; kind: "recentre" | "move"; swapChain: "base" | "unichain"; srcChain: "base" | "unichain" | null;
  fullBlockMs: number; fullSeenMs: number; swapBlock: number;
  swapTx: string; reactiveTx: string | null; callbackTx: string | null;
  departedTx: string | null; arriveRequestedTx: string | null; arrivedTx: string | null;
  toReactiveSeenMs: number | null; toCallbackSeenMs: number | null;
  legsSeenMs: { swapToMoveRequested: number | null; moveRequestedToDeparted: number | null; departedToArriveRequested: number | null; arriveRequestedToArrived: number | null } | null;
}

export interface EvmChain {
  id: number; name: string; rpc: string; explorer: string; vault: string; poolId: string;
  poolManager: string; token0: string; token1: string; stateView: string;
}

export interface RespoolData {
  generatedAt: string;
  chains: {
    lasna: { id: number; name: string; rpc: string; explorer: string; brain: string };
    base: EvmChain;
    unichain: EvmChain;
  };
  batches: Batch[];
  loops: Loop[];
}

export const D = raw as unknown as RespoolData;
export const CURRENT = D.batches.find((b) => b.current) as Batch;
