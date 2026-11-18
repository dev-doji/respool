"use client";
// The test-USDC vault card. Purely presentational: it renders a position and reports what the visitor asked
// for. All wallet and transaction logic stays in USDCPosition, so every state can be previewed without a wallet.
import { amountProblem, format, parse } from "@/lib/usdc";
import type { UsdcNetwork } from "@/lib/usdcNetworks";

export type Tab = "deposit" | "withdraw";
export type Action = "approve" | "deposit" | "redeem";
export type Position = { usdc: bigint; shares: bigint; allowance: bigint };
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

export function VaultView({ network, vault, position, input, tab, busy, notice, hash, onInput, onTab, onAction, onRefresh }: Props) {
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
  const max = position ? (deposit ? position.usdc : position.shares) : undefined;
  const problem = amountProblem(input, max, deposit ? "wallet balance" : "redeemable balance");
  const needsApproval = deposit && !!position && amount > 0n && !problem && position.allowance < amount;
  const action: Action = !deposit ? "redeem" : needsApproval ? "approve" : "deposit";
  const label = action === "redeem" ? "Withdraw" : action === "approve" ? "Approve test USDC" : "Deposit";
  const blocker = !position ? "Balances are not loaded yet." : amount === 0n ? "" : problem;
  const disabled = busy || !position || amount === 0n || !!problem;

  return (
    <div className="vault-view">
      <dl className="tiles">
        <div className="tile-stat sky"><dt className="sub">Wallet balance</dt><dd className="num-big">{position ? format(position.usdc) : "–"}<small> USDC</small></dd></div>
        <div className="tile-stat mint"><dt className="sub">In the vault</dt><dd className="num-big">{position ? format(position.shares) : "–"}<small> USDC</small></dd></div>
      </dl>

      <div className="seg" role="group" aria-label="Deposit or withdraw">
        <button type="button" aria-pressed={deposit} onClick={() => onTab("deposit")} disabled={busy}>Deposit</button>
        <button type="button" aria-pressed={!deposit} onClick={() => onTab("withdraw")} disabled={busy}>Withdraw</button>
      </div>

      <div>
        <label className="sub" htmlFor="usdc-amount">Amount in test USDC</label>
        <div className="field-row">
          <input
            id="usdc-amount" className="amount" inputMode="decimal" autoComplete="off" placeholder="0.00"
            value={input} onChange={(e) => onInput(e.target.value.trim())} disabled={busy}
            aria-invalid={!!problem} aria-describedby="amount-hint"
          />
          <button type="button" className="pbtn small max" disabled={busy || !max || max === 0n} onClick={() => max !== undefined && onInput(format(max))}>Max</button>
        </div>
        <p id="amount-hint" className={`hint${problem ? " bad" : ""}`}>
          {problem || (deposit ? `Needs a little ${network.name} ETH for gas.` : "Withdrawing returns test USDC to your wallet 1:1.")}
        </p>
      </div>

      <div className="act-row">
        <button type="button" className="pbtn dark" disabled={disabled} onClick={() => onAction(action)}>
          {busy && <span className="spinner" aria-hidden="true" />}{busy ? "Waiting…" : label}
        </button>
        <button type="button" className="pbtn" disabled={busy} onClick={onRefresh}>Refresh</button>
        {needsApproval && !busy && <span className="hint">Step 1 of 2: approve, then deposit.</span>}
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

      <p className="cap dim">Vault <a className="mono" href={`${network.explorer}/address/${vault}`} target="_blank" rel="noopener noreferrer">{vault.slice(0, 6)}…{vault.slice(-4)} ↗</a>. Shares are 1:1 with deposits. Nothing here earns yield.</p>
    </div>
  );
}
