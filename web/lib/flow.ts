// The guided flow in one sentence: where the visitor's money is, where liquidity is needed, and the one thing to do next.
import { format } from "./usdc.ts";

export type FlowChain = "unichain" | "base";
const NAME: Record<FlowChain, string> = { unichain: "Unichain Sepolia", base: "Base Sepolia" };

export interface Holdings { usdc?: bigint; shares?: bigint }

export type NextStep = {
  tone: "info" | "go" | "ok";
  title: string;
  text: string;
  /** What the button does, if there is one: move = open the Move form from that chain; deposit/withdraw = open the vault on that chain. */
  action?: { kind: "move" | "deposit" | "withdraw"; chain: FlowChain; label: string };
};

const pos = (v?: bigint) => (v ?? 0n) > 0n;
const other = (c: FlowChain): FlowChain => (c === "base" ? "unichain" : "base");

export function nextStep(args: {
  hasAccount: boolean;
  /** Where Reactive says liquidity is needed (`to`) and where it is quiet (`from`), or null when balanced. */
  rec: { from: FlowChain; to: FlowChain } | null;
  you: Partial<Record<FlowChain, Holdings>>;
}): NextStep {
  const { hasAccount, rec, you } = args;
  if (!hasAccount) return { tone: "info", title: "Connect a wallet to see your money", text: "Use the button at the top right. Everything on this page is testnet and play money." };
  if (!you.unichain || !you.base) return { tone: "info", title: "Reading your balances…", text: "Looking at your wallet and vault on both chains." };

  const usdc = (c: FlowChain) => you[c]?.usdc ?? 0n;
  const shares = (c: FlowChain) => you[c]?.shares ?? 0n;
  const faucet: NextStep = { tone: "info", title: "You have no test USDC yet", text: "Get free test USDC from the faucet on either chain, then come back here." };

  if (rec) {
    const { from, to } = rec;
    if (pos(shares(from))) return {
      tone: "go", title: `Your ${format(shares(from))} USDC is in the ${NAME[from]} vault, where liquidity has dried up`,
      text: `Liquidity is needed on ${NAME[to]}. Withdraw on ${NAME[from]}, move it to ${NAME[to]}, then deposit it there.`,
      action: { kind: "withdraw", chain: from, label: `Withdraw on ${NAME[from]}` },
    };
    if (pos(usdc(from))) return {
      tone: "go", title: `Your ${format(usdc(from))} USDC is on ${NAME[from]}, where liquidity has dried up`,
      text: `Liquidity moved to ${NAME[to]}. Move your money there, then deposit it to start earning.`,
      action: { kind: "move", chain: from, label: `Move to ${NAME[to]}` },
    };
    if (pos(shares(to))) return {
      tone: "ok", title: `Your ${format(shares(to))} USDC is working on ${NAME[to]}, where liquidity is needed`,
      text: "It stays yours and can be withdrawn any time. It earns test rewards while it is deposited.",
      action: { kind: "deposit", chain: to, label: "See your earnings" },
    };
    if (pos(usdc(to))) return {
      tone: "go", title: `Your ${format(usdc(to))} USDC is on ${NAME[to]}, where liquidity is needed`,
      text: "Deposit it in the vault to start earning test rewards.",
      action: { kind: "deposit", chain: to, label: `Deposit on ${NAME[to]}` },
    };
    return faucet;
  }

  for (const c of ["base", "unichain"] as FlowChain[]) {
    if (pos(shares(c))) return {
      tone: "ok", title: `Your ${format(shares(c))} USDC is deposited on ${NAME[c]}`,
      text: "Liquidity is balanced right now, so there is no better chain to move to. It earns test rewards while it is deposited.",
      action: { kind: "deposit", chain: c, label: "See your earnings" },
    };
  }
  for (const c of ["base", "unichain"] as FlowChain[]) {
    if (pos(usdc(c))) return {
      tone: "go", title: `You have ${format(usdc(c))} USDC on ${NAME[c]}`,
      text: `Liquidity is balanced, so either chain works. Deposit on ${NAME[c]} to start earning, or move it to ${NAME[other(c)]}.`,
      action: { kind: "deposit", chain: c, label: `Deposit on ${NAME[c]}` },
    };
  }
  return faucet;
}
