"use client";
// Reads both vaults and the brain straight from the chains, in the visitor's browser.
import { useCallback, useEffect, useRef, useState } from "react";
import { D, type ChainKey } from "@/lib/data";
import { NAMES, addrUrl, fmtTick, short } from "@/lib/format";
import { readBrain, readVault, type BrainState, type VaultState } from "@/lib/chain";
import { Reveal } from "./Reveal";

type Result<T> = { value?: T; error?: string };
const fmtL = (b: bigint) => (Number(b) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 0 });
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const settle = async <T,>(p: Promise<T>): Promise<Result<T>> => { try { return { value: await p }; } catch (e) { return { error: msg(e) }; } };

function LiveTag({ error }: { error?: string }) {
  return error
    ? <span className="tag"><span className="live-dot bad" />unreachable</span>
    : <span className="tag"><span className="live-dot" />live</span>;
}

function VaultCard({ chain, r }: { chain: "base" | "unichain"; r?: Result<VaultState> }) {
  const c = D.chains[chain];
  const link = <a className="mono" style={{ color: "var(--real)", textDecoration: "none" }} href={addrUrl(chain, c.vault)} target="_blank" rel="noopener">vault {short(c.vault)} ↗</a>;
  if (!r) {
    return (
      <div className="vault"><div className="vault-head"><h3>{NAMES[chain]}</h3></div>
        <div className="rng skel" /><dl className="kv skel"><dt>Loading</dt><dd>0000</dd></dl></div>
    );
  }
  if (r.error || !r.value) {
    return (
      <div className="vault">
        <div className="vault-head"><div><h3>{NAMES[chain]}</h3>{link}</div><LiveTag error={r.error} /></div>
        <p className="cap">Could not read {NAMES[chain]} from your browser ({r.error}). Use Refresh to retry.</p>
      </div>
    );
  }
  const v = r.value;
  const hasBase = v.base > 0n, hasLimit = v.limit > 0n;
  const pts = [v.tick, ...(hasBase ? [v.tl, v.tu] : []), ...(hasLimit ? [v.ll, v.lu] : [])];
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const pad = Math.max(60, (hi - lo) * 0.12), a = lo - pad, span = hi + pad - a;
  const x = (t: number) => `${((t - a) / span) * 100}%`;
  const w = (p: number, q: number) => `${((q - p) / span) * 100}%`;
  const label = `Price tick ${v.tick}.${hasBase ? ` Base position ${v.tl} to ${v.tu}.` : " No base position."}${hasLimit ? ` Limit position ${v.ll} to ${v.lu}.` : ""}`;
  return (
    <div className="vault">
      <div className="vault-head"><div><h3>{NAMES[chain]}</h3>{link}</div><LiveTag /></div>
      <div className="rng" role="img" aria-label={label}>
        {hasBase && <span className="seg-base" style={{ left: x(v.tl), width: w(v.tl, v.tu) }} />}
        {hasLimit && <span className="seg-limit" style={{ left: x(v.ll), width: w(v.ll, v.lu) }} />}
        <span className="px" style={{ left: x(v.tick) }} data-l={`tick ${fmtTick(v.tick)}`} />
      </div>
      <dl className="kv">
        {([["Total liquidity", fmtL(v.total)], ["Price tick", fmtTick(v.tick)], ["Base position", hasBase ? fmtL(v.base) : "none"], ["Limit position", hasLimit ? fmtL(v.limit) : "none"]] as const)
          .map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}
      </dl>
      <p className="cap dim">
        liquidity in units of 10¹⁸. red line: price.
        {hasBase ? ` dark bar: balanced base position (${fmtTick(v.tl)} to ${fmtTick(v.tu)}).` : " no balanced base position right now: the vault is holding one token and has parked it beside the price."}
        {hasLimit ? " yellow bar: limit position." : ""}
      </p>
    </div>
  );
}

export function Vaults() {
  const [res, setRes] = useState<{ base?: Result<VaultState>; unichain?: Result<VaultState>; brain?: Result<BrainState> }>({});
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState("");
  const running = useRef(false);

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true; setBusy(true);
    const [base, unichain, brain] = await Promise.all([settle(readVault("base")), settle(readVault("unichain")), settle(readBrain())]);
    setRes({ base, unichain, brain });
    setUpdated(`updated ${new Date().toLocaleTimeString()}`);
    setBusy(false); running.current = false;
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => { if (!document.hidden) void refresh(); }, 20000);
    return () => clearInterval(id);
  }, [refresh]);

  const results = [res.base, res.unichain, res.brain];
  const done = results.filter(Boolean).length === 3;
  const ok = results.filter((r) => r && !r.error).length;
  const dot = !done || busy ? "off" : ok === 3 ? "" : ok === 0 ? "bad" : "off";
  const text = !done ? "Connecting…" : busy ? "Reading chains…" : ok === 3 ? "Live from the chains" : ok === 0 ? "Chains unreachable" : `Partly live (${ok} of 3 reachable)`;

  const b = res.base?.value, u = res.unichain?.value;
  const tb = b ? Number(b.total) : 0, tu = u ? Number(u.total) : 0;
  const pb = b && u && tb + tu > 0 ? (tb / (tb + tu)) * 100 : 50;
  const brain = res.brain;
  const bs = brain?.value;

  return (
    <Reveal as="section" className="sec" id="vaults" aria-labelledby="vault-h">
      <div className="sec-head">
        <h2 id="vault-h">Where the <span className="ghost">liquidity is.</span></h2>
        <p className="cap">read from the chains by your browser, right now. if a node is unreachable it says so, and you can retry.</p>
      </div>
      <div className="status" style={{ marginBottom: 14 }}>
        <span className="tag"><span className={`live-dot ${dot}`} />{text}</span>
        <button className="pbtn small" onClick={() => void refresh()} disabled={busy}>{busy ? "Reading…" : "Refresh"}</button>
        <span className="cap dim">{updated}</span>
      </div>
      <div className="vaults">
        <VaultCard chain="base" r={res.base} />
        <VaultCard chain="unichain" r={res.unichain} />
        <div className="vault" style={{ gridColumn: "1 / -1" }}>
          <div className="vault-head">
            <div>
              <h3>Brain · Reactive Lasna</h3>
              <a className="mono" style={{ color: "var(--real)", textDecoration: "none" }} href={addrUrl("lasna" as ChainKey, D.chains.lasna.brain)} target="_blank" rel="noopener">brain {short(D.chains.lasna.brain)} ↗</a>
            </div>
            {brain ? <LiveTag error={brain.error} /> : null}
          </div>
          {!brain ? <dl className="kv skel"><dt>Loading</dt><dd>0000</dd></dl>
            : brain.error || !bs ? <p className="cap">Could not read Lasna ({brain.error}).</p>
            : (
              <dl className="kv" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
                <div><dt>lREACT left</dt><dd>{(Number(bs.balance) / 1e18).toFixed(2)}</dd></div>
                <div><dt>Moves started</dt><dd>{bs.lastMove}</dd></div>
                <div><dt>Move in flight</dt><dd>{bs.inFlight ? `#${bs.inFlight}` : "none"}</dd></div>
              </dl>
            )}
        </div>
      </div>
      <div className="split">
        <div className="status" style={{ justifyContent: "space-between" }}>
          <span className="sub">Liquidity split</span>
          <span className="cap dim">{b && u ? "share of total liquidity units; moves shift this" : "needs both chains"}</span>
        </div>
        <div className="split-bar" role="img" aria-label={b && u ? `Liquidity share: Base Sepolia ${pb.toFixed(0)} percent, Unichain Sepolia ${(100 - pb).toFixed(0)} percent` : "Liquidity share not available yet"}>
          <i className="b" style={{ width: `${pb}%` }} /><i className="u" style={{ width: `${100 - pb}%` }} />
        </div>
        <div className="split-lab">
          <span>{b && u ? `Base Sepolia ${pb.toFixed(0)}%` : "Base Sepolia"}</span>
          <span>{b && u ? `Unichain Sepolia ${(100 - pb).toFixed(0)}%` : "Unichain Sepolia"}</span>
        </div>
      </div>
    </Reveal>
  );
}
