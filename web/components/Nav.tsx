import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { LogoMark } from "./LogoMark";

const Arrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

export function Nav() {
  return (
    <header className="pnav-shell wrap">
      <nav className="pnav" aria-label="Main">
        <a className="pnav-logo" href="#top" aria-label="Respool, back to top">
          <LogoMark size={30} />
        </a>
        <a className="pnav-name" href="#top">Respool</a>
        <div className="pnav-line" aria-hidden="true"><i /><i /><i /><i /><i /></div>
        <div className="pnav-links">
          <a href="#how">How it works</a>
          <a href="#loop">The loop</a>
          <a href="#latency">Latency</a>
          <a href="#vaults">Vaults</a>
          <a href="https://github.com/dev-doji/respool" rel="noopener">GitHub</a>
        </div>
        <Link className="pbtn dark small" href="/app">Open app <Arrow /></Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}
