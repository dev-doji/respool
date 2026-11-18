import Link from "next/link";
import { WalletButton } from "./WalletButton";

// The same pill nav as the overview page, with the wallet connect button where a dApp visitor expects it.
export function AppNav() {
  return (
    <header className="pnav-shell">
      <nav className="pnav" aria-label="Main">
        <Link className="pnav-logo" href="/" aria-label="Respool overview">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2.5l8 4.6v9.8l-8 4.6-8-4.6V7.1z" stroke="#fff" strokeWidth="1.6" />
            <path d="M12 8l3.4 2v4L12 16l-3.4-2v-4z" fill="#2ed3a2" />
          </svg>
        </Link>
        <Link className="pnav-name" href="/">Respool</Link>
        <div className="pnav-line" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div className="pnav-links">
          <Link href="/app/map">Map</Link>
          <Link href="/app">Vault</Link>
          <Link href="/">Overview</Link>
          <Link href="/#latency">Latency</Link>
        </div>
        <WalletButton />
      </nav>
    </header>
  );
}
