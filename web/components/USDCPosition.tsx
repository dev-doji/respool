"use client";
// Wallet and transaction logic for the test-USDC vault on either supported chain. The calls, checks and encoding are unchanged;
// presentation lives in VaultView.

import { useEffect, useState } from "react";
import { parse } from "@/lib/usdc";
import { explainWalletError } from "@/lib/walletError";
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
  return { usdc, shares, allowance };
}

export function USDCPosition({ wallet, account, network }: { wallet: Wallet; account: string; network: UsdcNetwork }) {
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
      const latest = await readPosition(wallet, network, account);
      setPosition(latest);
      if (amount === 0n || amount > (action === "redeem" ? latest.shares : latest.usdc)) {
        throw new Error("Enter an amount within your available balance.");
      }
      if (action === "deposit" && amount > latest.allowance) {
        throw new Error("Approve the deposit amount before depositing.");
      }
      const data = action === "approve"
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
        say("ok", action === "approve" ? "Approved. You can deposit now." : action === "deposit" ? "Deposit confirmed." : "Withdrawal confirmed.");
        if (action !== "approve") setInput("");
        try {
          setPosition(await readPosition(wallet, network, account));
        } catch {
          setPosition(undefined);
          say("ok", "Transaction confirmed. Refresh to update your balances.");
        }
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

  return (
    <VaultView
      network={network} vault={vault} position={position} input={input} tab={tab} busy={busy} notice={notice} hash={hash}
      onInput={setInput} onTab={(t) => { setTab(t); setNotice(undefined); }} onAction={submit} onRefresh={refresh}
    />
  );
}
