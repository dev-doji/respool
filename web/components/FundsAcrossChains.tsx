"use client";
// Shows the visitor's test USDC on every chain, and points them to the right chain when their vault balance
// is somewhere other than the one the wallet is on (the vault card only shows the chain the wallet is set to).
import { useEffect, useState } from "react";
import { fundsElsewhere, readFunds, type ChainFunds } from "@/lib/funds";
import { format } from "@/lib/usdc";
import { NETWORKS, type UsdcNetwork } from "@/lib/usdcNetworks";

export function FundsAcrossChains({ account, activeId, switching, onSwitch }: {
  account: string; activeId: number; switching: boolean; onSwitch(id: number): void;
}) {
  const [funds, setFunds] = useState<ChainFunds[]>();

  useEffect(() => {
    let live = true;
    const load = () => {
      Promise.all(NETWORKS.map((n) => readFunds(n, account))).then(
        (rows) => { if (live) setFunds(rows); },
        () => { /* keep the last numbers; the next poll will try again */ },
      );
    };
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 8000);
    return () => { live = false; clearInterval(id); };
  }, [account, activeId]);

  const other = funds ? fundsElsewhere(funds, activeId) : undefined;
  const otherNet: UsdcNetwork | undefined = other ? NETWORKS.find((n) => n.id === other.id) : undefined;

  return (
    <div className="funds" aria-label="Your funds on each chain">
      <p className="sub">Your funds on each chain</p>
      <ul className="funds-list">
        {NETWORKS.map((n) => {
          const f = funds?.find((x) => x.id === n.id);
          const has = !!f && f.vault > 0n;
          return (
            <li key={n.id} className={has ? "has" : ""}>
              <span className="tick" aria-hidden="true">{has ? "✓" : "–"}</span>
              <b>{n.name}</b>
              <span className="mono">{f ? `${format(f.wallet)} in wallet · ${format(f.vault)} in vault` : "reading…"}</span>
              {n.id === activeId && <span className="tag">viewing</span>}
            </li>
          );
        })}
      </ul>
      {other && otherNet && (
        <div className="banner ok" role="status">
          <div>
            <span>You have <b>{format(other.vault)} USDC</b> in the vault on {otherNet.name}. To withdraw it to your wallet, switch to {otherNet.name}.</span>{" "}
            <button type="button" className="pbtn small" disabled={switching} onClick={() => onSwitch(otherNet.id)}>
              {switching ? "Switching…" : `Switch to ${otherNet.name}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
