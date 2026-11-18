"use client";
// Development-only: every state of VaultView with fake balances. Not linked from anywhere.
import { useState } from "react";
import { NETWORKS } from "@/lib/usdcNetworks";
import type { Entry } from "@/lib/activity";
import { ActivityTable, type ActivityRow } from "./ActivityTable";
import type { Move } from "@/lib/moves";
import { MoveView, YourMoves, type MoveViewProps, type Progress } from "./MoveView";
import { VaultView, type Notice, type Position, type Tab } from "./VaultView";

const VAULT = "0x1234567890abcdef1234567890abcdef12345678";
const funded: Position = { usdc: 25_500_000n, shares: 10_000_000n, allowance: 0n };

interface Scenario {
  title: string; vault?: string; position?: Position; input?: string; tab?: Tab; busy?: boolean; notice?: Notice; hash?: string;
}

const SCENARIOS: Scenario[] = [
  { title: "Not deployed", vault: "" },
  { title: "Loading balances", position: undefined },
  { title: "Ready, empty input", position: funded },
  { title: "Needs approval first", position: funded, input: "5" },
  { title: "Approved, ready to deposit", position: { ...funded, allowance: 5_000_000n }, input: "5" },
  { title: "Amount over balance", position: funded, input: "100" },
  { title: "Not a number", position: funded, input: "abc" },
  { title: "Withdraw tab", position: funded, tab: "withdraw", input: "2.5" },
  { title: "Waiting for wallet / chain", position: funded, input: "5", busy: true, notice: { tone: "info", text: "Transaction submitted. Waiting for confirmation." }, hash: "0xabc123" },
  { title: "Confirmed", position: { ...funded, shares: 15_000_000n }, notice: { tone: "ok", text: "Deposit confirmed." }, hash: "0xabc123" },
  { title: "Rejected in wallet", position: funded, input: "5", notice: { tone: "error", text: "The wallet request was cancelled." } },
  { title: "Wallet error with details", position: funded, input: "5", notice: { tone: "error", text: "Your wallet could not reach Unichain Sepolia. Open the wallet's network settings for Unichain Sepolia and check its RPC address, or try again in a moment.", detail: ["code: -32603", "message: Internal JSON-RPC error."].join("\n") } },
  { title: "Reverted", position: funded, input: "5", notice: { tone: "error", text: "The transaction reverted." }, hash: "0xdef456" },
];

function One({ s }: { s: Scenario }) {
  const [input, setInput] = useState(s.input ?? "");
  const [tab, setTab] = useState<Tab>(s.tab ?? "deposit");
  return (
    <section className="panel" aria-label={s.title}>
      <div className="panel-head"><h2 style={{ fontSize: 18 }}>{s.title}</h2></div>
      <VaultView
        network={NETWORKS[0]} vault={s.vault ?? VAULT} position={s.position} input={input} tab={tab} busy={!!s.busy} notice={s.notice} hash={s.hash}
        onInput={setInput} onTab={setTab} onAction={() => {}} onRefresh={() => {}}
      />
    </section>
  );
}

const HASH = (n: number) => "0x" + n.toString(16).padStart(64, "a");
const entry = (n: number, kind: Entry["kind"], amount: bigint, minutesAgo: number): Entry =>
  ({ hash: HASH(n), chainId: 1301, account: "0x2f85930757a742a480ac1196fcd42a952077968a", kind, amount: amount.toString(), at: 1_790_000_000_000 - minutesAgo * 60_000 });
const ROWS: Record<string, ActivityRow[]> = {
  "Activity: empty": [],
  "Activity: checking, confirmed, failed": [
    { entry: entry(1, "withdraw", 2_000_000n, 1), state: "checking", amount: 2_000_000n },
    { entry: entry(2, "deposit", 5_000_000n, 9), state: "confirmed", amount: 5_000_000n },
    { entry: entry(3, "approve", 5_000_000n, 12), state: "confirmed", amount: 5_000_000n },
    { entry: entry(4, "deposit", 50_000_000n, 30), state: "failed", amount: 50_000_000n },
  ],
};

function Activities() {
  return (
    <>
      {Object.entries(ROWS).map(([title, rows]) => (
        <section className="panel" aria-label={title} key={title}>
          <div className="panel-head"><h2 style={{ fontSize: 18 }}>{title}</h2></div>
          <ActivityTable rows={rows} network={{ name: "Unichain Sepolia", explorer: "https://sepolia.uniscan.xyz" }} account="0x2f85930757A742A480AC1196fcD42a952077968a" />
        </section>
      ))}
    </>
  );
}

const noop = () => {};
const base: MoveViewProps = {
  asset: "usdc", from: "unichain", to: "base", text: "5", balance: 15_000_000n, problem: "",
  quote: { state: "ok", fee: 10_000n, receive: 4_990_000n, fillSec: 10, min: 6_390n, max: 8_003_576n },
  connected: true, wrongChain: false, switching: false, needsApproval: false, ready: true, progress: { phase: "idle", usdc: true },
  onAsset: noop, onFlip: noop, onText: noop, onMax: noop, onSwitchChain: noop, onGo: noop,
};
const tx = (n: number) => "0x" + n.toString(16).padStart(64, "b");
const MOVE_SCENARIOS: { title: string; props: Partial<MoveViewProps> }[] = [
  { title: "Move: not connected", props: { connected: false, text: "", balance: undefined, ready: false, quote: { state: "ok", max: 8_003_576n, min: 6_390n } } },
  { title: "Move: wallet on another network", props: { wrongChain: true, ready: false } },
  { title: "Move: quote ready (USDC)", props: {} },
  { title: "Move: approval needed first", props: { needsApproval: true } },
  { title: "Move: more than balance", props: { text: "50", problem: "That is more than your balance (15 USDC).", ready: false } },
  { title: "Move: ETH quote", props: { asset: "eth", text: "0.001", balance: 556_000_000_000_000_000n, quote: { state: "ok", fee: 2_383_000_000_000n, receive: 997_617_000_000_000n, fillSec: 10, min: 3_825_698_128_318n, max: 4_461_000_000_000_000n } } },
  { title: "Move: approving", props: { progress: { phase: "approving", usdc: true, approveTx: tx(1) } } },
  { title: "Move: depositing", props: { progress: { phase: "depositing", usdc: true, approveTx: tx(1), depositTx: tx(2) } } },
  { title: "Move: waiting for the fill", props: { progress: { phase: "filling", usdc: true, approveTx: tx(1), depositTx: tx(2) } } },
  { title: "Move: arrived", props: { progress: { phase: "done", usdc: true, approveTx: tx(1), depositTx: tx(2), fillTx: tx(3), chainSeconds: 2, waitedSeconds: 3 } } },
  { title: "Move: no fill after 2.5 minutes", props: { progress: { phase: "error", usdc: true, failedStep: "fill", approveTx: tx(1), depositTx: tx(2), error: { text: "Your deposit is confirmed on Unichain Sepolia, but no delivery has appeared on Base Sepolia after 2.5 minutes. It may still arrive. On testnet, an unfilled deposit is not refunded automatically." } } as Progress } },
  { title: "Move: wallet rejected", props: { progress: { phase: "error", usdc: true, failedStep: "deposit", approveTx: tx(1), error: { text: "The wallet request was cancelled.", detail: ["code: 4001", "message: User rejected the request."].join("\n") } } } },
];
const MOVES: Move[] = [
  { id: tx(2), account: "0x2f85930757a742a480ac1196fcd42a952077968a", from: "unichain", to: "base", asset: "usdc", amount: "5000000", received: "4990000", depositId: "6101", depositTs: 1_790_000_000, startedAt: 1_790_000_000_000 - 120_000, fill: { tx: tx(3), block: 1, timestamp: 1_790_000_002 } },
  { id: tx(4), account: "0x2f85930757a742a480ac1196fcd42a952077968a", from: "base", to: "unichain", asset: "eth", amount: "1000000000000000", received: "997617000000000", depositId: "6102", depositTs: 1_790_000_100, startedAt: Date.now() - 20_000 },
  { id: tx(5), account: "0x2f85930757a742a480ac1196fcd42a952077968a", from: "unichain", to: "base", asset: "usdc", amount: "2000000", received: "1996000", depositId: "6103", depositTs: 1_789_990_000, startedAt: 1_789_990_000_000 },
];

function MoveScenarios() {
  return (
    <>
      {MOVE_SCENARIOS.map((m) => (
        <div key={m.title} style={{ gridColumn: "1 / -1", maxWidth: 640 }}>
          <p className="cap" style={{ margin: "0 0 6px" }}>{m.title}</p>
          <MoveView {...base} {...m.props} />
        </div>
      ))}
      <div style={{ gridColumn: "1 / -1" }}><p className="cap" style={{ margin: "0 0 6px" }}>Your moves: arrived, waiting, no fill seen</p><YourMoves moves={MOVES} now={Date.now()} /></div>
    </>
  );
}

export function PreviewStates() {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14, alignItems: "start" }}>{SCENARIOS.map((s) => <One key={s.title} s={s} />)}<Activities /><MoveScenarios /></div>;
}
