import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { LogoMark } from "./LogoMark";
import { WalletButton } from "./WalletButton";

// The same pill nav as the overview page, with the wallet connect button where a dApp visitor expects it.
export function AppNav() {
  return (
    <header className="pnav-shell">
      <nav className="pnav" aria-label="Main">
        <Link className="pnav-logo" href="/" aria-label="Respool overview">
          <LogoMark size={30} />
        </Link>
        <Link className="pnav-name" href="/">Respool</Link>
        <div className="pnav-line" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div className="pnav-links">
          <Link href="/app">App</Link>
          <Link href="/">Overview</Link>
          <Link href="/#latency">Latency</Link>
        </div>
        <ThemeToggle />
        <WalletButton />
      </nav>
    </header>
  );
}
