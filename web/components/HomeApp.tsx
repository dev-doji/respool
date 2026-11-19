"use client";
// The whole product on one simple page: a next-step line and two tabs, Move and Deposit and earn.
import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import { networkOf } from "@/lib/liquidity";
import type { ChainId } from "@/lib/recommend";
import { MovePanel } from "./MovePanel";
import { NextStepBar } from "./NextStepBar";
import { WalletPanel } from "./WalletPanel";

type Tab = "earn" | "move";

export function HomeApp() {
  const { address } = useAccount();
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<Tab>("earn");
  const [suggested, setSuggested] = useState<ChainId>();
  const [vaultChain, setVaultChain] = useState<number>();

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const openVault = (chain: ChainId) => { setVaultChain(networkOf(chain).id); setTab("earn"); };

  return (
    <div className="simple-app">
      <NextStepBar
        account={address} refreshKey={refreshKey}
        onMove={(from) => { setSuggested(from); setTab("move"); }}
        onVault={openVault}
      />

      <div className="seg tabs" role="tablist" aria-label="What do you want to do?">
        <button type="button" role="tab" id="tab-earn" aria-selected={tab === "earn"} aria-controls="pane-earn" onClick={() => setTab("earn")}>Deposit and earn</button>
        <button type="button" role="tab" id="tab-move" aria-selected={tab === "move"} aria-controls="pane-move" onClick={() => setTab("move")}>Move between chains</button>
      </div>

      {/* Both stay mounted so a move in progress keeps tracking while the visitor looks at the vault. */}
      <div role="tabpanel" id="pane-earn" aria-labelledby="tab-earn" hidden={tab !== "earn"}>
        <WalletPanel embedded preferChainId={vaultChain} onChanged={refresh} />
      </div>
      <div role="tabpanel" id="pane-move" aria-labelledby="tab-move" hidden={tab !== "move"}>
        <MovePanel suggestedFrom={suggested} onChanged={refresh} onArrived={openVault} />
      </div>
    </div>
  );
}
