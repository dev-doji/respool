import type { Metadata } from "next";
import { AppNav } from "@/components/AppNav";
import { MapApp } from "@/components/MapApp";
import { WalletProviders } from "@/components/WalletProviders";

export const metadata: Metadata = { title: "Respool liquidity map" };

export default function MapPage() {
  return (
    <WalletProviders>
      <div className="wrap">
        <a className="skip" href="#map-main">Skip to content</a>
        <AppNav />
        <main id="map-main" className="app-main">
          <div className="app-top">
            <div>
              <p className="cap">testnet · unichain sepolia and base sepolia · play money only</p>
              <h1>Where liquidity is</h1>
            </div>
          </div>
          <MapApp />
        </main>
      </div>
    </WalletProviders>
  );
}
