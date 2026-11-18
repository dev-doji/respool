"use client";
// The "Move funds between chains" card and the table of past moves. Purely presentational: every state can be
// previewed with fake data, and all wallet and bridge logic lives in MovePanel.
import { useEffect, useState } from "react";
import { networkOf } from "@/lib/liquidity";
import type { Move, Asset } from "@/lib/moves";
import type { ChainId } from "@/lib/recommend";
import { fmt } from "@/lib/units";

export type { Asset };
export type Phase = "idle" | "approving" | "depositing" | "filling" | "done" | "error";
export type StepKey = "approve" | "deposit" | "fill";

export interface Progress {
  phase: Phase;
  usdc: boolean;
  approveTx?: string;
  depositTx?: string;
  fillTx?: string;
  /** Deposit block to fill block, on the chains' own clocks, whole seconds. */
  chainSeconds?: number;
  /** Wall-clock seconds from the deposit confirming to the fill being seen. */
  waitedSeconds?: number;
  failedStep?: StepKey;
  error?: { text: string; detail?: string };
}

export interface QuoteView { state: "idle" | "loading" | "ok" | "error"; error?: string; fee?: bigint; receive?: bigint; fillSec?: number; min?: bigint; max?: bigint }

export interface MoveViewProps {
  asset: Asset; from: ChainId; to: ChainId; text: string; balance?: bigint; quote: QuoteView; problem: string;
  connected: boolean; wrongChain: boolean; switching: boolean; needsApproval: boolean; ready: boolean;
  progress: Progress;
  onAsset(a: Asset): void; onFlip(): void; onText(v: string): void; onMax(): void; onSwitchChain(): void; onGo(): void;
}

const NAME: Record<ChainId, string> = { unichain: "Unichain Sepolia", base: "Base Sepolia" };
const SYMBOL: Record<Asset, string> = { usdc: "USDC", eth: "ETH" };
const DECIMALS: Record<Asset, number> = { usdc: 6, eth: 18 };
const SHOWN: Record<Asset, number> = { usdc: 2, eth: 5 };
const show = (v: bigint | undefined, a: Asset) => (v === undefined ? "–" : fmt(v, DECIMALS[a], SHOWN[a]));
const short = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;
const txLink = (chain: ChainId, hash: string, label: string) => (
  <a className="mono" href={`${networkOf(chain).explorer}/tx/${hash}`} target="_blank" rel="noopener noreferrer" aria-label={label}>{short(hash)} ↗</a>
);

const ORDER: Record<Phase, number> = { idle: -1, approving: 0, depositing: 1, filling: 2, done: 3, error: -1 };

function Steps({ p, from, to }: { p: Progress; from: ChainId; to: ChainId }) {
  const steps: { key: StepKey; label: string; chain: ChainId; tx?: string }[] = [
    ...(p.usdc ? [{ key: "approve" as const, label: "Approve USDC for the bridge", chain: from, tx: p.approveTx }] : []),
    { key: "deposit", label: `Deposit on ${NAME[from]}`, chain: from, tx: p.depositTx },
    { key: "fill", label: `Relayer delivers on ${NAME[to]}`, chain: to, tx: p.fillTx },
  ];
  const index = (k: StepKey) => (k === "approve" ? 0 : k === "deposit" ? 1 : 2);
  const now = ORDER[p.phase];
  return (
    <ol className="nodes move-steps">
      {steps.map((s, i) => {
        const at = index(s.key);
        const failed = p.phase === "error" && p.failedStep === s.key;
        const done = p.phase === "done" || (now > at) || (p.phase === "error" && p.failedStep !== undefined && index(p.failedStep) > at);
        const active = !failed && !done && now === at;
        return (
          <li key={s.key} className={`node${done || active || failed ? " on" : ""}${active ? " now" : ""}`}>
            <span className="ix">{done ? "✓" : failed ? "!" : i + 1}</span>
            <div>
              <b>{s.label}</b>
              <div className="meta">
                <span className={`chain ${s.chain}`}>{s.chain === "base" ? "Base" : "Unichain"}</span>
                {s.tx && txLink(s.chain, s.tx, `Open the ${s.label} transaction on the explorer`)}
              </div>
            </div>
            <div className="at">{done ? "done" : failed ? "failed" : active ? <><span className="spinner" aria-hidden="true" /> working</> : "waiting"}</div>
          </li>
        );
      })}
    </ol>
  );
}

export function MoveView(p: MoveViewProps) {
  const sym = SYMBOL[p.asset];
  const working = p.progress.phase === "approving" || p.progress.phase === "depositing" || p.progress.phase === "filling";
  const q = p.quote;
  const showQuote = q.state === "ok" && p.text !== "" && !p.problem;
  const label = !p.connected ? "Connect a wallet (top right)"
    : p.wrongChain ? (p.switching ? "Switching…" : `Switch to ${NAME[p.from]}`)
    : working ? "Working…"
    : p.needsApproval ? `Approve ${sym}` : `Move ${p.text || "…"} ${sym} to ${NAME[p.to]}`;
  const disabled = !p.connected || working || p.switching || (!p.wrongChain && !p.ready);
  const idle = p.progress.phase === "idle";

  return (
    <section className="panel move" aria-labelledby="move-title" id="move">
      <div className="panel-head">
        <h2 id="move-title">Move funds between chains</h2>
        <span className="tag"><span className="live-dot off" />Across bridge · testnet</span>
      </div>

      <div className="seg" role="group" aria-label="Asset to move">
        {(["usdc", "eth"] as const).map((a) => (
          <button key={a} type="button" aria-pressed={p.asset === a} disabled={working} onClick={() => p.onAsset(a)}>{SYMBOL[a]}</button>
        ))}
      </div>

      <div className="route-row">
        <div className="route-end">
          <span className="sub">From</span><b>{NAME[p.from]}</b>
          <span className="hint">Balance {show(p.balance, p.asset)} {sym}</span>
        </div>
        <button type="button" className="icon-btn flip" aria-label={`Swap direction. Now ${NAME[p.from]} to ${NAME[p.to]}`} disabled={working} onClick={p.onFlip}>⇄</button>
        <div className="route-end"><span className="sub">To</span><b>{NAME[p.to]}</b></div>
      </div>

      <div>
        <label className="sub" htmlFor="move-amount">Amount in {sym}</label>
        <div className="field-row">
          <input id="move-amount" className="amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={p.text}
            onChange={(e) => p.onText(e.target.value.trim())} disabled={working} aria-invalid={!!p.problem} aria-describedby="move-hint" />
          <button type="button" className="pbtn small max" disabled={working || !p.balance} onClick={p.onMax}>Max</button>
        </div>
        <p id="move-hint" className={`hint${p.problem ? " bad" : ""}`}>
          {p.problem || (q.state === "error" ? `Could not get a bridge quote: ${q.error}` : q.max !== undefined
            ? `The bridge can fill up to ${show(q.max, p.asset)} ${sym} per transfer on testnet.` : "Testnet limits are small, so start with a small amount.")}
        </p>
      </div>

      {showQuote && (
        <dl className="quote">
          <div><dt>You send</dt><dd>{p.text} {sym}</dd></div>
          <div><dt>Bridge fee</dt><dd>{show(q.fee, p.asset)} {sym}</dd></div>
          <div><dt>You receive</dt><dd><b>{show(q.receive, p.asset)} {sym}</b> on {NAME[p.to]}</dd></div>
          <div><dt>Arrives in about</dt><dd>{q.fillSec} s</dd></div>
        </dl>
      )}

      <div className="act-row">
        <button type="button" className="pbtn dark" disabled={disabled} onClick={p.wrongChain ? p.onSwitchChain : p.onGo}>
          {working && <span className="spinner" aria-hidden="true" />}{label}
        </button>
        {p.connected && !p.wrongChain && !working && !p.ready && p.text === "" && <span className="hint">Enter an amount to see the quote.</span>}
        {p.needsApproval && p.ready && !working && <span className="hint">Step 1 of 2: approve, then the move starts.</span>}
      </div>

      {!idle && <Steps p={p.progress} from={p.from} to={p.to} />}

      <div aria-live="polite">
        {p.progress.phase === "done" && (
          <div className="banner ok">
            <div>
              <b>Arrived on {NAME[p.to]}.</b>{" "}
              <span>
                Delivered about {p.progress.chainSeconds ?? "?"} s after the deposit confirmed (the chains&apos; own clocks, ±1 s); you waited {p.progress.waitedSeconds ?? "?"} s.
              </span>
            </div>
          </div>
        )}
        {p.progress.phase === "error" && p.progress.error && (
          <div className="banner error">
            <div>
              <span>{p.progress.error.text}</span>
              {p.progress.error.detail && <details className="detail"><summary>Details</summary><pre>{p.progress.error.detail}</pre></details>}
            </div>
          </div>
        )}
      </div>

      <p className="cap dim">
        Moves go through Across, a bridge, so the funds are delivered by a relayer and not by Respool. Testnet only: tiny limits, and an unfilled testnet
        deposit is not refunded automatically.
      </p>
    </section>
  );
}

/** Local time, filled in after mount so server and browser never disagree about the time zone. */
function When({ at }: { at: number }) {
  const [text, setText] = useState("");
  useEffect(() => { setText(new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })); }, [at]);
  return <time dateTime={new Date(at).toISOString()}>{text || "…"}</time>;
}

export function YourMoves({ moves, now }: { moves: Move[]; now: number }) {
  return (
    <section className="activity" aria-labelledby="moves-title">
      <div className="panel-head"><h3 id="moves-title">Your moves</h3></div>
      <p className="cap dim">Moves started in this browser. This page finds each delivery on the destination chain; the Reactive watcher records the same deposits and deliveries on Reactive Network (see the map).</p>
      {moves.length === 0 ? (
        <div className="banner"><span>No moves yet. When you move funds, each one shows up here with where it went and how long it took.</span></div>
      ) : (
        <div className="tablewrap">
          <table>
            <caption className="sr-only">Cross-chain moves</caption>
            <thead><tr><th scope="col">When</th><th scope="col">Route</th><th scope="col">Sent</th><th scope="col">Received</th><th scope="col">Status</th><th scope="col">Transactions</th></tr></thead>
            <tbody>
              {moves.map((m) => {
                const filled = !!m.fill;
                const stale = !filled && now - m.startedAt > 10 * 60_000;
                return (
                  <tr key={m.id}>
                    <td data-label="When"><When at={m.startedAt} /></td>
                    <td data-label="Route"><b>{m.from === "base" ? "Base" : "Unichain"} → {m.to === "base" ? "Base" : "Unichain"}</b></td>
                    <td className="amt" data-label="Sent">{fmt(BigInt(m.amount), DECIMALS[m.asset], SHOWN[m.asset])} {SYMBOL[m.asset]}</td>
                    <td className="amt" data-label="Received">{fmt(BigInt(m.received), DECIMALS[m.asset], SHOWN[m.asset])} {SYMBOL[m.asset]}</td>
                    <td data-label="Status">
                      <span className={`state ${filled ? "confirmed" : stale ? "failed" : "checking"}`}>
                        {!filled && !stale && <span className="spinner" aria-hidden="true" />}
                        {filled ? `Arrived in ~${Math.max(0, (m.fill?.timestamp ?? 0) - m.depositTs)} s` : stale ? "No fill seen" : "Waiting for fill"}
                      </span>
                    </td>
                    <td data-label="Transactions">
                      {txLink(m.from, m.id, "Open the deposit transaction on the explorer")}
                      {m.fill && <> {txLink(m.to, m.fill.tx, "Open the fill transaction on the explorer")}</>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
