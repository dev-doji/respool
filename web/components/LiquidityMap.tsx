"use client";
// The live liquidity map: one card per chain, where the user's money is, and where liquidity is needed.
import { useCallback, useEffect, useRef, useState } from "react";
import { CHAIN_IDS, networkOf, readMap, readWatcher, readYou, type MapData, type WatcherStats, type YouView } from "@/lib/liquidity";
import { recommend, type ChainId } from "@/lib/recommend";
import { fmt } from "@/lib/units";
import { NetworkMap } from "./NetworkMap";
import { NAMES } from "@/lib/format";

const NAME: Record<ChainId, string> = { unichain: NAMES.unichain, base: NAMES.base };
const units = (b: bigint) => (Number(b) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 0 });
const dash = "–";

function Card({ chain, data, you, hasAccount }: { chain: ChainId; data?: MapData; you?: YouView; hasAccount: boolean }) {
  const v = data?.chains[chain];
  const net = networkOf(chain);
  return (
    <section className="chain-card panel" aria-labelledby={`cc-${chain}`}>
      <div className="panel-head">
        <h3 id={`cc-${chain}`}>{NAME[chain]}</h3>
        <span className="tag"><span className={`live-dot${v ? "" : " off"}`} />{v ? "live" : "reading…"}</span>
      </div>
      <dl className="kv">
        <div><dt>Respool pool</dt><dd>{v?.pool ? units(v.pool.liquidity) : dash}<small> units</small></dd></div>
        <div><dt>Recent swaps</dt><dd>{v?.activity !== undefined ? v.activity.toFixed(1) : dash}</dd></div>
        <div><dt>USDC in the vault</dt><dd>{v?.vaultUsdc !== undefined ? fmt(v.vaultUsdc, 6, 2) : dash}</dd></div>
        <div><dt>Can leave by bridge</dt><dd>{v?.bridge ? `≤ ${fmt(v.bridge.usdcMax, 6, 1)}` : dash}<small> USDC</small></dd></div>
      </dl>
      <div className="you">
        <span className="sub">You on this chain</span>
        {!hasAccount ? <p className="hint">Connect a wallet to see your money here.</p> : (
          <dl className="kv you-kv">
            <div><dt>USDC in wallet</dt><dd>{you?.usdc !== undefined ? fmt(you.usdc, 6, 2) : dash}</dd></div>
            <div><dt>ETH in wallet</dt><dd>{you?.eth !== undefined ? fmt(you.eth, 18, 4) : dash}</dd></div>
            <div><dt>USDC in vault</dt><dd>{you?.shares !== undefined ? fmt(you.shares, 6, 2) : dash}</dd></div>
          </dl>
        )}
      </div>
      {v && v.errors.length > 0 && <p className="hint bad">Could not read {v.errors.map((e) => (e.length > 90 ? e.slice(0, 87) + "..." : e)).join("; ")}. It retries on the next refresh.</p>}
      {!net.vault && <p className="hint">No USDC vault deployed on this chain.</p>}
    </section>
  );
}

export function LiquidityMap({ account, refreshKey, onSuggest }: { account?: string; refreshKey: number; onSuggest: (from: ChainId) => void }) {
  const [data, setData] = useState<MapData>();
  const [you, setYou] = useState<Partial<Record<ChainId, YouView>>>({});
  const [watcher, setWatcher] = useState<WatcherStats>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true; setBusy(true);
    try {
      const [map, uni, base] = await Promise.all([
        readMap(),
        account ? readYou("unichain", account) : Promise.resolve(undefined),
        account ? readYou("base", account) : Promise.resolve(undefined),
      ]);
      setData(map); setYou({ unichain: uni, base }); setError("");
      readWatcher().then(setWatcher).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the chains");
    } finally {
      running.current = false; setBusy(false);
    }
  }, [account]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    return () => clearInterval(id);
  }, [refresh, refreshKey]);

  const activity = data && data.chains.unichain.activity !== undefined && data.chains.base.activity !== undefined
    ? { unichain: data.chains.unichain.activity, base: data.chains.base.activity } : undefined;
  const rec = activity && data?.settings ? recommend(activity, data.settings) : null;
  const bridge = data?.chains.unichain.bridge ?? data?.chains.base.bridge;
  const updated = data ? new Date(data.at).toLocaleTimeString() : "";

  return (
    <section aria-labelledby="map-title">
      <div className="panel-head" style={{ marginBottom: 12 }}>
        <h2 id="map-title" style={{ fontFamily: "var(--g)", fontWeight: 600, fontSize: 24, letterSpacing: "-.035em", margin: 0 }}>Liquidity map</h2>
        <div className="status">
          <span className="cap dim">{data ? `updated ${updated}` : ""}</span>
          <button className="pbtn small" onClick={() => void refresh()} disabled={busy}>{busy ? "Reading…" : "Refresh"}</button>
        </div>
      </div>

      {error && <div className="banner error" role="alert"><span>{error}</span></div>}

      <div className={`banner reco${rec ? " hot" : ""}`} role="status" style={{ marginBottom: 12 }}>
        <div>
          {!data ? <span>Reading both chains…</span> : rec ? (
            <>
              <b>{NAME[rec.to]} is busier: {rec.hot.toFixed(1)} recent swaps against {rec.cold.toFixed(1)}.</b>{" "}
              <span>Liquidity is needed there. </span>
              <button className="pbtn small" onClick={() => onSuggest(rec.from)}>Move from {NAME[rec.from]}</button>
            </>
          ) : (
            <span>
              <b>Balanced right now.</b> Recent swap activity: Unichain {activity ? activity.unichain.toFixed(1) : dash}, Base {activity ? activity.base.toFixed(1) : dash}.
              A move is suggested when one chain is {data.settings ? data.settings.ratio : 3}× busier and has at least {data.settings ? data.settings.minHot : 2} recent swaps.
            </span>
          )}
        </div>
      </div>

      <NetworkMap
        activity={activity}
        pool={data ? { unichain: data.chains.unichain.pool ? Number(data.chains.unichain.pool.liquidity) / 1e18 : undefined, base: data.chains.base.pool ? Number(data.chains.base.pool.liquidity) / 1e18 : undefined } : undefined}
        flow={rec ? { from: rec.from, to: rec.to } : null}
        bridge={bridge ? { fillSec: bridge.fillSec, feePct: bridge.feePct } : undefined}
        watcher={watcher}
      />

      <div className="map-grid">
        <Card chain="unichain" data={data} you={you.unichain} hasAccount={!!account} />
        <div className="bridge-link" aria-label="Bridge between the two chains">
          <span className="sub">Across bridge</span>
          <b>{bridge ? `~${bridge.fillSec} s` : dash}</b>
          <span className="cap dim">{bridge ? `~${bridge.feePct.toFixed(2)}% fee` : "reading…"}</span>
        </div>
        <Card chain="base" data={data} you={you.base} hasAccount={!!account} />
      </div>
      <p className="cap" style={{ marginTop: 10 }} role="status">
        <b>Reactive is watching the Across bridge on both chains.</b>{" "}
        {watcher
          ? watcher.fills > 0
            ? `It has seen ${watcher.deposits} deposit${watcher.deposits === 1 ? "" : "s"} and ${watcher.fills} ${watcher.fills === 1 ? "delivery" : "deliveries"}; deposit to delivery took ${watcher.lastSec} s last time (${watcher.avgSec} s on average, ${watcher.minSec}–${watcher.maxSec} s).`
            : `It has seen ${watcher.deposits} deposit${watcher.deposits === 1 ? "" : "s"} so far and no deliveries yet.`
          : "Reading its record…"}
      </p>
      <p className="cap dim" style={{ marginTop: 10 }}>
        “Respool pool” is the pool Reactive manages; “recent swaps” is that pool&apos;s activity as the Reactive contract sees it. “USDC in the vault” is the custody vault&apos;s balance. “Can leave by bridge” is the most Across will fill in one transfer right now.
      </p>
    </section>
  );
}
