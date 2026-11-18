import type { Metadata } from "next";
import { AppNav } from "@/components/AppNav";
import { WalletPanel } from "@/components/WalletPanel";
import { WalletProviders } from "@/components/WalletProviders";

export const metadata: Metadata = { title: "Respool app: test USDC vault" };

export default function AppPage() {
  return (
    <WalletProviders>
      <div className="wrap">
        <a className="skip" href="#app-main">Skip to content</a>
        <AppNav />
        <main id="app-main" className="app-main">
          <div className="app-top">
            <div>
              <p className="cap">testnet · base sepolia · play money only</p>
              <h1>Your vault</h1>
            </div>
          </div>
          <WalletPanel />
        </main>
      </div>
    </WalletProviders>
  );
}
