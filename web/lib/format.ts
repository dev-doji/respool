import { D, type ChainKey } from "./data";

export const NAMES: Record<ChainKey, string> = { base: "Base Sepolia", unichain: "Unichain Sepolia", lasna: "Reactive Lasna" };
export const SHORT: Record<ChainKey, string> = { base: "Base", unichain: "Unichain", lasna: "Lasna" };

/** Milliseconds as seconds with `d` decimals. */
export const sec = (ms: number, d = 1): string => (ms / 1000).toFixed(d);
export const short = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const addrUrl = (c: ChainKey, a: string): string => `${D.chains[c].explorer}/address/${a}`;
export const txUrl = (c: ChainKey, t: string): string => `${D.chains[c].explorer}/tx/${t}`;
export const fmtTick = (n: number): string => (n < 0 ? "−" : "") + Math.abs(n);
