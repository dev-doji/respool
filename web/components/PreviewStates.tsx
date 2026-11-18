"use client";
// Development-only: every state of VaultView with fake balances. Not linked from anywhere.
import { useState } from "react";
import { NETWORKS } from "@/lib/usdcNetworks";
import type { Entry } from "@/lib/activity";
import { ActivityTable, type ActivityRow } from "./ActivityTable";
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

export function PreviewStates() {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14, alignItems: "start" }}>{SCENARIOS.map((s) => <One key={s.title} s={s} />)}<Activities /></div>;
}
