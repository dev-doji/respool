import type { Metadata } from "next";
import { AppNav } from "@/components/AppNav";
import { HomeApp } from "@/components/HomeApp";
import { WalletProviders } from "@/components/WalletProviders";

export const metadata: Metadata = { title: "Respool app: move your USDC and earn" };

export default function AppPage() {
  return (
    <WalletProviders>
      <div className="wrap calm">
        <a className="skip" href="#app-main">Skip to content</a>
        <AppNav />
        <main id="app-main" className="app-main">
          <div className="app-top">
            <div>
              <h1>Earn on the chain that needs liquidity</h1>
              <p className="app-note">Pick a chain, deposit test USDC, take it out any time. Testnet, play money.</p>
            </div>
          </div>
          <HomeApp />
        </main>
      </div>
    </WalletProviders>
  );
}
