"use client";
// The Liquidity Map page body: the live map, and (below it) the Move panel.
import { useState } from "react";
import { useAccount } from "wagmi";
import type { ChainId } from "@/lib/recommend";
import { LiquidityMap } from "./LiquidityMap";

export function MapApp() {
  const { address } = useAccount();
  const [refreshKey, setRefreshKey] = useState(0);
  const [suggested, setSuggested] = useState<ChainId>();
  void setRefreshKey; void suggested;

  return (
    <div className="map-app">
      <LiquidityMap account={address} refreshKey={refreshKey} onSuggest={setSuggested} />
    </div>
  );
}
