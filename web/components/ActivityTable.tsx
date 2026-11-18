"use client";
// Where the money moved: one row per approval, deposit or withdrawal, each checked against the chain.
import { useEffect, useState } from "react";
import type { Entry } from "@/lib/activity";
import type { TxState } from "@/lib/receipt";
import { format } from "@/lib/usdc";
import type { UsdcNetwork } from "@/lib/usdcNetworks";

export interface ActivityRow { entry: Entry; state: TxState; /** USDC base units, taken from the chain once checked. */ amount: bigint }

const WHAT = { approve: "Approval", deposit: "Deposit", withdraw: "Withdrawal" } as const;
const MOVED = {
  approve: "No money moved. This lets the vault take up to this amount.",
  deposit: "Your wallet → Vault",
  withdraw: "Vault → Your wallet",
} as const;
const STATE = { checking: "Checking…", confirmed: "Confirmed", failed: "Failed" } as const;

/** Local time, filled in after mount so the server and browser never disagree about the time zone. */
function When({ at }: { at: number }) {
  const [text, setText] = useState("");
  useEffect(() => { setText(new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })); }, [at]);
  return <time dateTime={new Date(at).toISOString()}>{text || "…"}</time>;
}

export function ActivityTable({ rows, network, account }: { rows: ActivityRow[]; network: Pick<UsdcNetwork, "name" | "explorer">; account: string }) {
  return (
    <section className="activity" aria-labelledby="activity-title">
      <div className="panel-head">
        <h3 id="activity-title">Activity</h3>
        <a className="mono" href={`${network.explorer}/address/${account}`} target="_blank" rel="noopener noreferrer">Full history on the explorer ↗</a>
      </div>
      <p className="cap dim">Your actions from this browser on {network.name}. Each row is checked against the chain, and the amount shown is what the chain recorded.</p>
      {rows.length === 0 ? (
        <div className="banner"><span>Nothing yet. After you approve, deposit or withdraw, each step appears here with what moved.</span></div>
      ) : (
        <div className="tablewrap">
          <table>
            <caption className="sr-only">Approvals, deposits and withdrawals</caption>
            <thead><tr><th scope="col">When</th><th scope="col">What</th><th scope="col">Money moved</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Transaction</th></tr></thead>
            <tbody>
              {rows.map(({ entry, state, amount }) => (
                <tr key={entry.hash}>
                  <td data-label="When"><When at={entry.at} /></td>
                  <td data-label="What"><b>{WHAT[entry.kind]}</b></td>
                  <td className="moved" data-label="Money moved">{MOVED[entry.kind]}</td>
                  <td className="amt" data-label="Amount">{format(amount)} USDC</td>
                  <td data-label="Status"><span className={`state ${state}`}>{state === "checking" && <span className="spinner" aria-hidden="true" />}{STATE[state]}</span></td>
                  <td data-label="Transaction"><a className="mono" href={`${network.explorer}/tx/${entry.hash}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${WHAT[entry.kind]} transaction on the explorer`}>{entry.hash.slice(0, 8)}…{entry.hash.slice(-4)} ↗</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
