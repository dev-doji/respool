const Arrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

export function Nav() {
  return (
    <header className="pnav-shell wrap">
      <nav className="pnav" aria-label="Main">
        <a className="pnav-logo" href="#top" aria-label="Respool, back to top">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2.5l8 4.6v9.8l-8 4.6-8-4.6V7.1z" stroke="#fff" strokeWidth="1.6" />
            <path d="M12 8l3.4 2v4L12 16l-3.4-2v-4z" fill="#2ed3a2" />
          </svg>
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
        <a className="pbtn dark small" href="#vaults">See it live <Arrow /></a>
      </nav>
    </header>
  );
}
