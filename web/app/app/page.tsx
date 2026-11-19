import type { Metadata } from "next";
import { AppNav } from "@/components/AppNav";
import { HomeApp } from "@/components/HomeApp";
import { WalletProviders } from "@/components/WalletProviders";

export const metadata: Metadata = { title: "Respool app: move your USDC and earn" };

export default function AppPage() {
  return (
    <WalletProviders>
      <div className="wrap">
        <a className="skip" href="#app-main">Skip to content</a>
        <AppNav />
        <main id="app-main" className="app-main">
          <div className="app-top">
            <div>
              <p className="cap">testnet · unichain sepolia and base sepolia · play money only</p>
              <h1>Move and earn</h1>
            </div>
          </div>
          <HomeApp />
        </main>
      </div>
    </WalletProviders>
  );
}
