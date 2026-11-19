"use client";
// The whole product on one page: see where liquidity is, move your money there, deposit it and watch it earn.
import { useCallback, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { networkOf } from "@/lib/liquidity";
import type { ChainId } from "@/lib/recommend";
import { LiquidityMap } from "./LiquidityMap";
import { MovePanel } from "./MovePanel";
import { WalletPanel } from "./WalletPanel";

export function HomeApp() {
  const { address } = useAccount();
  const [refreshKey, setRefreshKey] = useState(0);
  const [suggested, setSuggested] = useState<ChainId>();
  const [vaultChain, setVaultChain] = useState<number>();
  const moveRef = useRef<HTMLDivElement>(null);
  const vaultRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const scrollTo = (el: HTMLElement | null) => el?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  const openVault = (chain: ChainId) => { setVaultChain(networkOf(chain).id); setTimeout(() => scrollTo(vaultRef.current), 50); };

  return (
    <div className="map-app">
      <ol className="flow-strip" aria-label="How it works">
        <li><b>1</b> See where liquidity is</li>
        <li><b>2</b> Move your money there</li>
        <li><b>3</b> Deposit it and earn</li>
      </ol>

      <LiquidityMap
        account={address} refreshKey={refreshKey}
        onSuggest={(from) => { setSuggested(from); setTimeout(() => scrollTo(moveRef.current), 50); }}
        onVault={openVault}
        onRec={(to) => { if (to) setVaultChain((cur) => cur ?? networkOf(to).id); }}
      />

      <div ref={moveRef} id="move" className="flow-anchor">
        <MovePanel suggestedFrom={suggested} onChanged={refresh} onArrived={(to) => openVault(to)} />
      </div>

      <div ref={vaultRef} id="vault" className="flow-anchor">
        <WalletPanel embedded preferChainId={vaultChain} onChanged={refresh} />
      </div>
    </div>
  );
}
