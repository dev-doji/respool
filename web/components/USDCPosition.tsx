"use client";
// Wallet and transaction logic for the test-USDC vault on either supported chain. The calls, checks and encoding are unchanged;
// presentation lives in VaultView.

import { useEffect, useRef, useState } from "react";
import { addEntry, fetchReceipt, loadEntries, type Entry } from "@/lib/activity";
import { settledPosition } from "@/lib/positionWait";
import { amountFromReceipt, stateFromReceipt, type TxState } from "@/lib/receipt";
import { parse } from "@/lib/usdc";
import { explainWalletError } from "@/lib/walletError";
import { ActivityTable, type ActivityRow } from "./ActivityTable";
import type { Wallet } from "./WalletPanel";
import type { UsdcNetwork } from "@/lib/usdcNetworks";
import { VaultView, type Action, type Notice, type Position, type Tab } from "./VaultView";

const encode = (value: string | bigint) => BigInt(value).toString(16).padStart(64, "0");

async function requireChain(wallet: Wallet, network: UsdcNetwork) {
  if (Number(await wallet.request({ method: "eth_chainId" })) !== network.id) {
    throw new Error(`Switch to ${network.name} to continue.`);
  }
}

async function readPosition(wallet: Wallet, network: UsdcNetwork, account: string): Promise<Position> {
  const { vault, usdc: USDC } = network;
  await requireChain(wallet, network);
  async function call(to: string, data: string) {
    return BigInt(await wallet.request({ method: "eth_call", params: [{ to, data }, "latest"] }) as string);
  }
  const [asset, usdc, shares, allowance] = await Promise.all([
    call(vault, "0x38d52e0f"),
    call(USDC, "0x70a08231" + encode(account)),
    call(vault, "0x70a08231" + encode(account)),
    call(USDC, "0xdd62ed3e" + encode(account) + encode(vault)),
  ]);
  await requireChain(wallet, network);
  if (asset !== BigInt(USDC)) throw new Error(`The configured vault asset does not match ${network.name} USDC.`);
  // Rewards are extra: if a vault has none (or the read fails) the deposit and withdrawal still work.
  const extra = await Promise.allSettled([call(vault, "0x008cc262" + encode(account)), call(vault, "0x7b0a47ee"), call(vault, "0x18160ddd")]);
  const val = (r: PromiseSettledResult<bigint>) => (r.status === "fulfilled" ? r.value : undefined);
  return { usdc, shares, allowance, earned: val(extra[0]), ratePerSecond: val(extra[1]), totalShares: val(extra[2]) };
}

export function USDCPosition({ wallet, account, network, onChanged }: { wallet: Wallet; account: string; network: UsdcNetwork; onChanged?: () => void }) {
  const [position, setPosition] = useState<Position>();
  const [input, setInput] = useState("");
  const [tab, setTab] = useState<Tab>("deposit");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [hash, setHash] = useState("");
  const amount = parse(input);
  const vault = network.vault;
  const USDC = network.usdc;
  const say = (tone: Notice["tone"], text: string, detail?: string) => setNotice({ tone, text, detail });

  // An approval confirmed in this session. The wallet's node can lag, so a deposit trusts it over a stale read.
  const approvedRef = useRef(0n);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [checks, setChecks] = useState<Record<string, { state: TxState; amount?: bigint }>>({});
  const checking = useRef(new Set<string>());

  useEffect(() => { setEntries(loadEntries(network.id, account)); }, [network.id, account]);

  // Check every recorded transaction against the chain by its receipt, through the public RPC.
  useEffect(() => {
    let live = true;
    for (const entry of entries) {
      const key = entry.hash.toLowerCase();
      if (checks[key]?.state === "confirmed" || checks[key]?.state === "failed" || checking.current.has(key)) continue;
      checking.current.add(key);
      (async () => {
        for (let attempt = 0; attempt < 15 && live; attempt++) {
          try {
            const receipt = await fetchReceipt(network.rpc, entry.hash);
            if (receipt) {
              const amount = amountFromReceipt(entry.kind, receipt, { account, vault, usdc: USDC });
              if (live) setChecks((c) => ({ ...c, [key]: { state: stateFromReceipt(receipt), amount } }));
              break;
            }
          } catch {
            // The node may not know the transaction yet, or be briefly unreachable. Try again.
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        checking.current.delete(key);
      })();
    }
    return () => { live = false; checking.current.clear(); };
  }, [entries, checks, network.rpc, account, vault, USDC]);

  useEffect(() => {
    if (!vault) return;
    let active = true;
    readPosition(wallet, network, account).then(
      (result) => { if (active) setPosition(result); },
      () => { if (active) say("error", "Could not read the test USDC vault. Use Refresh to try again."); },
    );
    return () => { active = false; };
  }, [wallet, network, vault, account]);

  async function refresh() {
    setBusy(true);
    setNotice(undefined);
    try {
      setPosition(await readPosition(wallet, network, account));
    } catch {
      setPosition(undefined);
      say("error", "Could not read the test USDC vault.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(action: Action) {
    setBusy(true);
    setNotice(undefined);
    setHash("");
    try {
      const read = await readPosition(wallet, network, account);
      // If the wallet's node has not yet caught up with an approval confirmed in this session, trust the approval.
      const latest: Position = action === "deposit" && read.allowance < amount && approvedRef.current >= amount
        ? { ...read, allowance: approvedRef.current }
        : read;
      setPosition(latest);
      if (action !== "claim" && (amount === 0n || amount > (action === "redeem" ? latest.shares : latest.usdc))) {
        throw new Error("Enter an amount within your available balance.");
      }
      if (action === "deposit" && amount > latest.allowance) {
        throw new Error("Approve the deposit amount before depositing.");
      }
      const data = action === "claim" ? "0x4e71d92d"
        : action === "approve"
        ? "0x095ea7b3" + encode(vault) + encode(amount)
        : (action === "deposit" ? "0xb6b55f25" : "0xdb006a75") + encode(amount);
      const tx = await wallet.request({
        method: "eth_sendTransaction",
        params: [{ from: account, to: action === "approve" ? USDC : vault, data }],
      }) as string;
      setHash(tx);
      say("info", "Transaction submitted. Waiting for confirmation.");
      for (let attempt = 0; attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await requireChain(wallet, network);
        const receipt = await wallet.request({ method: "eth_getTransactionReceipt", params: [tx] }) as { status: string } | null;
        if (!receipt) continue;
        if (receipt.status !== "0x1") throw new Error("The transaction reverted.");
        const done = action === "approve" ? "Approved. You can deposit now." : action === "deposit" ? "Deposit confirmed. Your money is working and earning test rewards." : action === "claim" ? "Rewards claimed to your wallet." : "Withdrawal confirmed.";
        if (action === "claim") {
          setHash(tx);
          for (let i = 0; i < 6; i++) { const p = await readPosition(wallet, network, account).catch(() => undefined); if (p) setPosition(p); if (p && (p.earned ?? 0n) < (latest.earned ?? 0n)) break; await new Promise((r) => setTimeout(r, 1500)); }
          say("ok", done);
          return;
        }
        // Remember it, so the activity table shows it straight away (and checks it against the chain).
        addEntry({ hash: tx, chainId: network.id, account: account.toLowerCase(), kind: action === "redeem" ? "withdraw" : action, amount: amount.toString(), at: Date.now() });
        setEntries(loadEntries(network.id, account));
        approvedRef.current = action === "approve" ? amount : action === "deposit" ? 0n : approvedRef.current;
        if (action !== "approve") setInput("");
        say("info", "Confirmed. Updating your balances…");
        // The wallet's node can lag a block behind its own receipt. Wait for the chain's numbers to show the
        // change; if they don't within the window, show what this transaction must have produced.
        const settled = await settledPosition({ kind: action, before: latest, amount, read: () => readPosition(wallet, network, account) });
        setPosition(settled.position);
        onChanged?.();
        say("ok", settled.confirmed ? done : `${done} Your wallet's connection is a little behind, so these balances are what the transaction produces. Use Refresh in a moment to double-check.`);
        return;
      }
      say("info", "Confirmation is pending. Check the transaction before submitting again.");
    } catch (error) {
      // Show the wallet's real reason. The raw error also goes to the console for debugging.
      console.error("[respool] wallet request failed", error);
      const problem = explainWalletError(error, network.name);
      say("error", problem.text, problem.detail);
    } finally {
      setBusy(false);
    }
  }

  const rows: ActivityRow[] = entries.map((entry) => {
    const check = checks[entry.hash.toLowerCase()];
    return { entry, state: check?.state ?? "checking", amount: check?.amount ?? BigInt(entry.amount) };
  });

  return (
    <>
      <VaultView
        network={network} vault={vault} position={position} input={input} tab={tab} busy={busy} notice={notice} hash={hash}
        onInput={setInput} onTab={(t) => { setTab(t); setNotice(undefined); }} onAction={submit} onRefresh={refresh}
      />
      <ActivityTable rows={rows} network={network} account={account} />
    </>
  );
}
