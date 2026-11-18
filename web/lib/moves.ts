// A record of the cross-chain moves started in this browser, so a move whose page was closed keeps being tracked
// and the table can show where the money went. Each entry is a pointer; the fill is found on the destination chain.
import type { ChainId } from "./recommend.ts";

export type Asset = "usdc" | "eth";

export interface Move {
  /** The deposit transaction hash, lower-case. Unique per move. */
  id: string;
  account: string;
  from: ChainId;
  to: ChainId;
  asset: Asset;
  /** Base units sent (USDC 6 decimals, ETH 18), as a decimal string. */
  amount: string;
  /** Base units the bridge promised to deliver. */
  received: string;
  depositId: string;
  /** Block time of the deposit, whole seconds (chain clock). */
  depositTs: number;
  /** Milliseconds since the epoch when the deposit confirmed. */
  startedAt: number;
  fill?: { tx: string; block: number; timestamp: number };
}

const KEY = "respool.moves.v1";
const CHAINS: ChainId[] = ["unichain", "base"];

function isMove(v: unknown): v is Move {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  const fill = m.fill as Record<string, unknown> | undefined;
  return typeof m.id === "string" && /^0x[0-9a-f]{64}$/.test(m.id) && typeof m.account === "string"
    && CHAINS.includes(m.from as ChainId) && CHAINS.includes(m.to as ChainId) && (m.asset === "usdc" || m.asset === "eth")
    && typeof m.amount === "string" && /^\d+$/.test(m.amount) && typeof m.received === "string" && /^\d+$/.test(m.received)
    && typeof m.depositId === "string" && /^\d+$/.test(m.depositId) && typeof m.depositTs === "number" && typeof m.startedAt === "number"
    && (fill === undefined || (typeof fill.tx === "string" && typeof fill.block === "number" && typeof fill.timestamp === "number"));
}

function readAll(): Move[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isMove) : [];
  } catch {
    return []; // storage can be blocked (private windows); moves still work, they are just not remembered
  }
}

export function loadMoves(account: string): Move[] {
  const who = account.toLowerCase();
  return readAll().filter((m) => m.account === who).sort((a, b) => b.startedAt - a.startedAt);
}

/** Insert or replace by id. */
export function saveMove(move: Move): void {
  try {
    const rest = readAll().filter((m) => m.id !== move.id);
    rest.push({ ...move, id: move.id.toLowerCase(), account: move.account.toLowerCase() });
    window.localStorage.setItem(KEY, JSON.stringify(rest.slice(-100)));
  } catch {
    // Not remembering is fine; the transfer itself already happened.
  }
}
