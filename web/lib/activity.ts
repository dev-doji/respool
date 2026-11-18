// A record of the actions taken in this browser, so the app can show where money moved. Each entry is only a
// pointer (transaction hash, kind, amount); the table checks every one against the chain by its receipt.
//
// Why not read history straight from the chain: the public RPCs cap eth_getLogs at 1,000 blocks (Unichain) and
// 200 blocks (Base), so a history scan gets slower every day. Receipt lookups by hash have no such limit.
import type { ActivityKind, Receipt } from "./receipt";

export interface Entry {
  hash: string;
  chainId: number;
  /** Lower-case wallet address. */
  account: string;
  kind: ActivityKind;
  /** USDC base units, as a decimal string. */
  amount: string;
  /** Milliseconds since the epoch. */
  at: number;
}

const KEY = "respool.activity.v1";
const KINDS: ActivityKind[] = ["approve", "deposit", "withdraw"];

function isEntry(value: unknown): value is Entry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return typeof e.hash === "string" && /^0x[0-9a-f]{64}$/i.test(e.hash)
    && typeof e.chainId === "number" && typeof e.account === "string"
    && KINDS.includes(e.kind as ActivityKind) && typeof e.amount === "string" && /^\d+$/.test(e.amount)
    && typeof e.at === "number";
}

function readAll(): Entry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return []; // storage can be blocked or empty (private windows); the app works without it
  }
}

/** This account's entries on this chain, newest first. */
export function loadEntries(chainId: number, account: string): Entry[] {
  const who = account.toLowerCase();
  return readAll().filter((e) => e.chainId === chainId && e.account === who).sort((a, b) => b.at - a.at);
}

export function addEntry(entry: Entry): void {
  try {
    const rest = readAll().filter((e) => e.hash.toLowerCase() !== entry.hash.toLowerCase());
    rest.push({ ...entry, account: entry.account.toLowerCase() });
    window.localStorage.setItem(KEY, JSON.stringify(rest.slice(-200)));
  } catch {
    // Not being able to remember is fine; the transaction itself already happened.
  }
}

/** The receipt for a transaction, or null while the node has not seen it yet. */
export async function fetchReceipt(rpc: string, hash: string): Promise<Receipt | null> {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [hash] }),
    signal: AbortSignal.timeout(9000),
  });
  const json = (await res.json()) as { result?: Receipt | null; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result ?? null;
}
