"use client";
// Two cards, one per chain, showing the visitor's wallet and deposited USDC. Clicking one switches the wallet to it,
// so a card also marks where deposited money is when the wallet is on the other chain.
import { useEffect, useState } from "react";
import { readFunds, type ChainFunds } from "@/lib/funds";
import { format } from "@/lib/usdc";
import { NETWORKS } from "@/lib/usdcNetworks";

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

  return (
    <div className="chain-pick" role="group" aria-label="Choose a network">
      {NETWORKS.map((n) => {
        const f = funds?.find((x) => x.id === n.id);
        const active = n.id === activeId;
        return (
          <button key={n.id} type="button" className="cp" aria-pressed={active} disabled={switching} onClick={() => !active && onSwitch(n.id)}>
            <span className="cp-name">{n.name}{!active && f && f.vault > 0n && <span className="cp-flag">money here</span>}</span>
            <span className="cp-line"><small>In wallet</small><b>{f ? format(f.wallet) : "…"}</b></span>
            <span className="cp-line"><small>Deposited</small><b>{f ? format(f.vault) : "…"}</b></span>
          </button>
        );
      })}
    </div>
  );
}
