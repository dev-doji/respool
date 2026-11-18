"use client";
// Wallet and bridge logic for moving ETH or USDC between Unichain Sepolia and Base Sepolia through Across.
// The wallet signs one or two transactions on the origin chain; a relayer delivers on the destination chain,
// which this panel then watches until the fill appears.
import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import { useSwitchChain } from "wagmi";
import { approveCall, blockTimestamp, depositCall, depositIdFromReceipt, fetchQuote, findFill, SPOKE_POOLS, WETH, type Call, type Quote } from "@/lib/across";
import { fetchReceipt } from "@/lib/activity";
import { networkOf, otherOf, readYou } from "@/lib/liquidity";
import { loadMoves, saveMove, type Asset, type Move } from "@/lib/moves";
import type { ChainId } from "@/lib/recommend";
import { allowanceData, ethCall, word } from "@/lib/rpc";
import { fmt, parseAmount } from "@/lib/units";
import { useWallet } from "@/lib/useWallet";
import { explainWalletError } from "@/lib/walletError";
import { MoveView, YourMoves, type Progress, type QuoteView, type StepKey } from "./MoveView";

const DECIMALS: Record<Asset, number> = { usdc: 6, eth: 18 };
const SYMBOL: Record<Asset, string> = { usdc: "USDC", eth: "ETH" };
/** ETH kept back for gas when moving ETH. */
const GAS_RESERVE = 500_000_000_000_000n;
/** Sample sizes used to learn the bridge's limits before the visitor has typed anything. */
const SAMPLE: Record<Asset, bigint> = { usdc: 1_000_000n, eth: 1_000_000_000_000_000n };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Waits for a receipt on the origin chain's public RPC (independent of the wallet's own node). */
async function waitReceipt(rpcUrl: string, hash: string, timeoutMs = 90_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const receipt = await fetchReceipt(rpcUrl, hash).catch(() => null);
    if (receipt) {
      if (receipt.status !== "0x1") throw new Error("The transaction reverted.");
      return receipt;
    }
    await sleep(1000);
  }
  throw new Error("The transaction has not confirmed yet. Check it on the explorer before trying again.");
}

async function waitUntil(check: () => Promise<boolean>, timeoutMs: number) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check().catch(() => false)) return true;
    await sleep(1000);
  }
  return false;
}

const IDLE: Progress = { phase: "idle", usdc: false };

export function MovePanel({ suggestedFrom, onChanged }: { suggestedFrom?: ChainId; onChanged: () => void }) {
  const { address, chainId, isConnected, wallet, error: walletError } = useWallet();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [asset, setAsset] = useState<Asset>("usdc");
  const [from, setFrom] = useState<ChainId>("unichain");
  const [text, setText] = useState("");
  const [balance, setBalance] = useState<bigint>();
  const [allowance, setAllowance] = useState<bigint>();
  const [quote, setQuote] = useState<QuoteView>({ state: "idle" });
  const [limits, setLimits] = useState<{ min: bigint; max: bigint }>();
  const [quoteFor, setQuoteFor] = useState<bigint>();
  const [progress, setProgress] = useState<Progress>(IDLE);
  const [moves, setMoves] = useState<Move[]>([]);
  const [now, setNow] = useState(0);
  const [tick, setTick] = useState(0);
  const quoteSeq = useRef(0);
  const trackingBusy = useRef(false);

  const to = otherOf(from);
  const net = networkOf(from), dst = networkOf(to);
  const decimals = DECIMALS[asset], symbol = SYMBOL[asset];
  const amount = parseAmount(text, decimals);
  const wrongChain = isConnected && chainId !== net.id;
  const show = (v: bigint) => fmt(v, decimals, asset === "usdc" ? 2 : 5);
  const working = progress.phase === "approving" || progress.phase === "depositing" || progress.phase === "filling";

  useEffect(() => { if (suggestedFrom && !working) setFrom(suggestedFrom); }, [suggestedFrom]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setNow(Date.now()); }, [moves, tick]);
  useEffect(() => { setMoves(address ? loadMoves(address) : []); }, [address]);

  // The visitor's balance of the chosen asset on the origin chain, read from the public RPC.
  useEffect(() => {
    if (!address) { setBalance(undefined); return; }
    let live = true;
    readYou(from, address).then((y) => { if (live) setBalance(asset === "usdc" ? y.usdc : y.eth); }).catch(() => { if (live) setBalance(undefined); });
    return () => { live = false; };
  }, [address, from, asset, tick]);

  // USDC the bridge is already allowed to take.
  useEffect(() => {
    if (!address || asset !== "usdc") { setAllowance(undefined); return; }
    let live = true;
    ethCall(net.rpc, net.usdc, allowanceData(address, SPOKE_POOLS[net.id])).then((h) => { if (live) setAllowance(word(h)); }).catch(() => { if (live) setAllowance(undefined); });
    return () => { live = false; };
  }, [address, asset, net.rpc, net.usdc, net.id, tick]);

  // A bridge quote for what was typed (or a sample, to learn the limits), a moment after the visitor stops typing.
  useEffect(() => {
    const seq = ++quoteSeq.current;
    const wanted = amount ?? SAMPLE[asset];
    setQuote((q) => ({ ...q, state: "loading" }));
    const id = setTimeout(async () => {
      try {
        const q: Quote = await fetchQuote({
          inputToken: asset === "eth" ? WETH : net.usdc, outputToken: asset === "eth" ? WETH : dst.usdc,
          originChainId: net.id, destinationChainId: dst.id, amount: wanted,
        });
        if (seq !== quoteSeq.current) return;
        setLimits({ min: q.minDeposit, max: q.maxDeposit });
        setQuoteFor(wanted);
        setQuote({ state: "ok", fee: q.totalRelayFee, receive: q.outputAmount, fillSec: q.estimatedFillTimeSec, min: q.minDeposit, max: q.maxDeposit });
      } catch (e) {
        if (seq !== quoteSeq.current) return;
        setQuoteFor(undefined);
        setQuote((q) => ({ ...q, state: "error", error: e instanceof Error ? e.message : "unavailable" }));
      }
    }, 450);
    return () => clearTimeout(id);
  }, [asset, from, text]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep tracking moves whose fill has not been seen yet (also after the page was closed and reopened).
  useEffect(() => {
    const open = moves.filter((m) => !m.fill && Date.now() - m.startedAt < 10 * 60_000);
    if (open.length === 0) return;
    const id = setInterval(async () => {
      if (trackingBusy.current || document.hidden) return;
      trackingBusy.current = true;
      try {
        let changed = false;
        for (const m of open) {
          const d = networkOf(m.to);
          const fill = await findFill(d.rpc, SPOKE_POOLS[d.id], networkOf(m.from).id, BigInt(m.depositId), d.logWindow).catch(() => null);
          if (fill) { saveMove({ ...m, fill }); changed = true; }
        }
        if (changed && address) { setMoves(loadMoves(address)); setTick((t) => t + 1); onChanged(); }
      } finally { trackingBusy.current = false; }
    }, 3000);
    return () => clearInterval(id);
  }, [moves, address]); // eslint-disable-line react-hooks/exhaustive-deps

  // What is wrong with the typed amount, in a sentence.
  let problem = "";
  if (text !== "" && amount === undefined) problem = `Use numbers only, with up to ${decimals} decimals.`;
  else if (amount !== undefined) {
    if (balance !== undefined && amount > balance) problem = `That is more than your balance (${show(balance)} ${symbol}).`;
    else if (asset === "eth" && balance !== undefined && amount + GAS_RESERVE > balance) problem = "Leave about 0.0005 ETH in your wallet to pay for gas.";
    else if (limits && amount < limits.min) problem = `Below the bridge's minimum (${show(limits.min)} ${symbol}).`;
    else if (limits && amount > limits.max) problem = `Above what the bridge can fill right now (${show(limits.max)} ${symbol}).`;
  }
  const needsApproval = asset === "usdc" && amount !== undefined && allowance !== undefined && allowance < amount;
  const ready = !!wallet && !wrongChain && amount !== undefined && !problem && quote.state === "ok" && quoteFor === amount && (asset === "eth" || allowance !== undefined);

  function onMax() {
    if (balance === undefined) return;
    let max = asset === "eth" ? (balance > GAS_RESERVE ? balance - GAS_RESERVE : 0n) : balance;
    if (limits && max > limits.max) max = limits.max;
    setText(max > 0n ? formatUnits(max, decimals) : "");
  }

  async function execute() {
    if (!wallet || !address || amount === undefined || working) return;
    let step: StepKey = asset === "usdc" ? "approve" : "deposit";
    const inputToken = asset === "eth" ? WETH : net.usdc, outputToken = asset === "eth" ? WETH : dst.usdc;
    const send = async (call: Call): Promise<string> => {
      if (Number(await wallet.request({ method: "eth_chainId" })) !== net.id) throw new Error(`Switch your wallet to ${net.name} to continue.`);
      const tx: Record<string, string> = { from: address, to: call.to, data: call.data };
      if (call.value > 0n) tx.value = "0x" + call.value.toString(16);
      return (await wallet.request({ method: "eth_sendTransaction", params: [tx] })) as string;
    };
    setProgress({ phase: asset === "usdc" ? "approving" : "depositing", usdc: asset === "usdc" });
    try {
      const spoke = SPOKE_POOLS[net.id];
      if (asset === "usdc") {
        const have = word(await ethCall(net.rpc, net.usdc, allowanceData(address, spoke)));
        if (have < amount) {
          const tx = await send(approveCall(net.usdc, spoke, amount));
          setProgress((p) => ({ ...p, approveTx: tx }));
          await waitReceipt(net.rpc, tx);
          // The public node can lag its own receipt by a moment: wait until it shows the allowance before depositing.
          await waitUntil(async () => word(await ethCall(net.rpc, net.usdc, allowanceData(address, spoke))) >= amount, 15_000);
        }
      }
      step = "deposit";
      setProgress((p) => ({ ...p, phase: "depositing" }));
      const q = await fetchQuote({ inputToken, outputToken, originChainId: net.id, destinationChainId: dst.id, amount });
      if (q.isAmountTooLow) throw new Error("That amount is too low for the bridge.");
      const depositTx = await send(depositCall({ depositor: address, recipient: address, inputToken, outputToken, inputAmount: amount, destinationChainId: dst.id, quote: q, native: asset === "eth" }));
      setProgress((p) => ({ ...p, depositTx }));
      const receipt = await waitReceipt(net.rpc, depositTx);
      const depositId = depositIdFromReceipt(receipt, q.spokePool);
      if (depositId === undefined) throw new Error("The deposit confirmed but the bridge did not report an ID. Check the transaction on the explorer.");
      const confirmedAt = Date.now();
      const depositTs = await blockTimestamp(net.rpc, receipt.blockNumber);
      const move: Move = {
        id: depositTx.toLowerCase(), account: address.toLowerCase(), from, to, asset, amount: amount.toString(), received: q.outputAmount.toString(),
        depositId: depositId.toString(), depositTs, startedAt: confirmedAt,
      };
      saveMove(move);
      setMoves(loadMoves(address));
      step = "fill";
      setProgress((p) => ({ ...p, phase: "filling" }));
      let fill = null;
      const end = Date.now() + 150_000;
      while (Date.now() < end) {
        fill = await findFill(dst.rpc, SPOKE_POOLS[dst.id], net.id, depositId, dst.logWindow).catch(() => null);
        if (fill) break;
        await sleep(1200);
      }
      if (!fill) {
        setProgress((p) => ({ ...p, phase: "error", failedStep: "fill", error: { text: `Your deposit is confirmed on ${net.name}, but no delivery has appeared on ${dst.name} after 2.5 minutes. It may still arrive: the move keeps being tracked below. On testnet, an unfilled deposit is not refunded automatically.` } }));
        return;
      }
      saveMove({ ...move, fill });
      setMoves(loadMoves(address));
      setProgress((p) => ({ ...p, phase: "done", fillTx: fill.tx, chainSeconds: Math.max(0, fill.timestamp - depositTs), waitedSeconds: Math.round((Date.now() - confirmedAt) / 1000) }));
      setTick((t) => t + 1);
      onChanged();
    } catch (error) {
      console.error("[respool] move failed", error);
      const problem = explainWalletError(error, net.name);
      setProgress((p) => ({ ...p, phase: "error", failedStep: step, error: problem }));
    }
  }

  const idleAfter = () => { if (progress.phase === "done" || progress.phase === "error") setProgress(IDLE); };

  return (
    <>
      <MoveView
        asset={asset} from={from} to={to} text={text} balance={balance} quote={quote} problem={problem}
        connected={isConnected && !walletError} wrongChain={wrongChain} switching={switching} needsApproval={needsApproval} ready={ready}
        progress={progress}
        onAsset={(a) => { idleAfter(); setAsset(a); setText(""); setLimits(undefined); setQuoteFor(undefined); }}
        onFlip={() => { idleAfter(); setFrom(to); setLimits(undefined); setQuoteFor(undefined); }}
        onText={(v) => { idleAfter(); setText(v); }}
        onMax={onMax}
        onSwitchChain={() => switchChain({ chainId: net.id })}
        onGo={() => void execute()}
      />
      {walletError && <div className="banner error" role="alert"><span>{walletError}</span></div>}
      {isConnected && <YourMoves moves={moves} now={now} />}
    </>
  );
}
