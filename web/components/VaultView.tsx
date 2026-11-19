"use client";
// The test-USDC vault card. Purely presentational: it renders a position and reports what the visitor asked
// for. All wallet and transaction logic stays in USDCPosition, so every state can be previewed without a wallet.
import { useEffect, useRef, useState } from "react";
import { amountProblem, format, parse } from "@/lib/usdc";
import { fmt } from "@/lib/units";
import type { UsdcNetwork } from "@/lib/usdcNetworks";

export type Tab = "deposit" | "withdraw";
export type Action = "approve" | "deposit" | "redeem" | "claim";
/** `earned`, `ratePerSecond` and `totalShares` come from the reward stream; they are absent on a vault without rewards. */
export type Position = { usdc: bigint; shares: bigint; allowance: bigint; earned?: bigint; ratePerSecond?: bigint; totalShares?: bigint };
export type Notice = { tone: "info" | "ok" | "error"; text: string; detail?: string };

interface Props {
  /** Network the vault is on: its name and block explorer. */
  network: Pick<UsdcNetwork, "name" | "explorer">;
  /** Vault address, or "" when the vault has not been deployed. */
  vault: string;
  position?: Position;
  input: string;
  tab: Tab;
  busy: boolean;
  notice?: Notice;
  hash?: string;
  onInput(value: string): void;
  onTab(tab: Tab): void;
  onAction(action: Action): void;
  onRefresh(): void;
}

// Rounds, so 999.9999… tokens a day (integer division on the rate) reads as 1,000.
const dayText = (v: bigint) => Math.round(Number(v) / 1e18).toLocaleString("en-US");

export function VaultView({ network, vault, position, input, tab, busy, notice, hash, onInput, onTab, onAction, onRefresh }: Props) {
  // The earned counter ticks up every second between reads, using the pool's reward rate and this depositor's share.
  const readAt = useRef(Date.now());
  const [, setTick] = useState(0);
  useEffect(() => { readAt.current = Date.now(); }, [position]);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(id); }, []);

  if (!vault) {
    return (
      <div className="banner" role="status">
        <div>
          <b>The test USDC vault is not live yet.</b>
          <p className="hint">It has not been deployed to {network.name}, so deposits are switched off. Nothing is wrong with your wallet.</p>
        </div>
      </div>
    );
  }

  const amount = parse(input);
  const deposit = tab === "deposit";
  const total = position?.totalShares ?? 0n;
  const seconds = BigInt(Math.max(0, Math.floor((Date.now() - readAt.current) / 1000)));
  const liveEarned = position && position.earned !== undefined
    ? position.earned + (position.ratePerSecond && total > 0n ? (position.ratePerSecond * seconds * position.shares) / total : 0n)
    : undefined;
  const perDay = position?.ratePerSecond !== undefined ? position.ratePerSecond * 86_400n : undefined;
  const sharePct = position && total > 0n ? Number((position.shares * 10_000n) / total) / 100 : 0;
  const max = position ? (deposit ? position.usdc : position.shares) : undefined;
  const problem = amountProblem(input, max, deposit ? "wallet balance" : "redeemable balance");
  const needsApproval = deposit && !!position && amount > 0n && !problem && position.allowance < amount;
  const action: Action = !deposit ? "redeem" : needsApproval ? "approve" : "deposit";
  const label = action === "redeem" ? "Withdraw" : action === "approve" ? "Approve test USDC" : "Deposit";
  const emptyHere = !deposit && !!position && position.shares === 0n;
  // Always say why the main button is greyed out, instead of leaving it silently disabled.
  const blocker = !position ? "Balances are not loaded yet."
    : emptyHere ? `Nothing in the vault on ${network.name}. If you deposited on the other chain, switch to it to withdraw.`
    : amount === 0n ? (deposit ? "Enter an amount." : "Enter an amount, or press Max to withdraw everything.")
    : problem;
  const disabled = busy || !position || amount === 0n || !!problem;

  return (
    <div className="vault-view">
      <dl className="stat-row">
        <div><dt className="sub">In your wallet</dt><dd>{position ? format(position.usdc) : "–"}<small> USDC</small></dd></div>
        <div><dt className="sub">Deposited</dt><dd>{position ? format(position.shares) : "–"}<small> USDC</small></dd></div>
        {position && liveEarned !== undefined && (
          <div>
            <dt className="sub">Rewards earned</dt>
            <dd>{fmt(liveEarned, 18, 2)}<small> tRSP</small></dd>
            <button type="button" className="linkbtn" disabled={busy || liveEarned === 0n} onClick={() => onAction("claim")}>Claim</button>
          </div>
        )}
      </dl>
      {position && liveEarned !== undefined && (
        <p className="hint">
          {position.shares > 0n
            ? `Your share of the pool is ${sharePct.toFixed(sharePct < 10 ? 1 : 0)}%${perDay !== undefined ? `, out of ${dayText(perDay)} tRSP a day paid to everyone deposited` : ""}.`
            : `Deposit to start earning${perDay !== undefined ? ` your share of ${dayText(perDay)} tRSP a day` : ""}.`}
        </p>
      )}

      <div className="seg tabs" role="group" aria-label="Deposit or withdraw">
        <button type="button" aria-pressed={deposit} onClick={() => onTab("deposit")} disabled={busy}>Deposit</button>
        <button type="button" aria-pressed={!deposit} onClick={() => onTab("withdraw")} disabled={busy}>Withdraw</button>
      </div>

      <div>
        <label className="sub" htmlFor="usdc-amount">{deposit ? "Amount to deposit" : "Amount to withdraw"}</label>
        <div className="field-row">
          <input
            id="usdc-amount" className="amount" inputMode="decimal" autoComplete="off" placeholder="0.00"
            value={input} onChange={(e) => onInput(e.target.value.trim())} disabled={busy}
            aria-invalid={!!problem} aria-describedby="amount-hint"
          />
          <button type="button" className="pbtn small max" disabled={busy || !max || max === 0n} onClick={() => max !== undefined && onInput(format(max))}>Max</button>
        </div>
        <p id="amount-hint" className={`hint${problem ? " bad" : ""}`}>
          {problem || (deposit ? `You also need a little ${network.name} ETH for gas.` : "Comes back to your wallet 1:1.")}
        </p>
      </div>

      <div className="act-row">
        <button type="button" className="pbtn dark wide" disabled={disabled} onClick={() => onAction(action)}>
          {busy && <span className="spinner" aria-hidden="true" />}{busy ? "Waiting for your wallet…" : needsApproval ? `${label} first (step 1 of 2)` : amount > 0n && !problem ? `${label} ${format(amount)} USDC` : label}
        </button>
        {!busy && disabled && blocker && !problem && <span className="hint">{blocker}</span>}
      </div>

      <div aria-live="polite">
        {notice && (
          <div className={`banner ${notice.tone}`}>
            {notice.tone === "info" && busy && <span className="spinner" aria-hidden="true" />}
            <div>
              <span>{notice.text}</span>
              {hash && <> <a href={`${network.explorer}/tx/${hash}`} target="_blank" rel="noopener noreferrer">View transaction ↗</a></>}
              {notice.detail && (
                <details className="detail">
                  <summary>Details</summary>
                  <pre>{notice.detail}</pre>
                </details>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="cap dim"><button type="button" className="linkbtn" disabled={busy} onClick={onRefresh}>Refresh balances</button> · Vault <a className="mono" href={`${network.explorer}/address/${vault}`} target="_blank" rel="noopener noreferrer">{vault.slice(0, 6)}…{vault.slice(-4)} ↗</a>. Your deposit is 1:1 and always yours to withdraw.</p>
    </div>
  );
}
