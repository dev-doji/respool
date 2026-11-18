"use client";
// A network map of the system: the two pools, Reactive Network in the middle, and the Across bridge underneath.
// Live mode shows real numbers (swap activity, pool size, bridge record). "Simulate" replays the move story with
// compressed timing and a visible SIMULATION label: nothing in it is a real transaction.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChainId } from "@/lib/recommend";
import type { WatcherStats } from "@/lib/liquidity";

const W = 1000, H = 470;
const NAME: Record<ChainId, string> = { unichain: "Unichain Sepolia", base: "Base Sepolia" };
const CHAINS: ChainId[] = ["unichain", "base"];

// Node centres (SVG units). Base mirrors Unichain.
const NODE = { lasna: { x: 500, y: 78 }, unichain: { x: 165, y: 318 }, base: { x: 835, y: 318 }, across: { x: 500, y: 405 } };
const mx = (x: number, c: ChainId) => (c === "unichain" ? x : W - x);

type Kind = "event" | "callback" | "liquidity";
const edges = {
  event: (c: ChainId) => `M${mx(165, c)} 252 Q${mx(165, c)} 78 ${mx(405, c)} 70`,
  callback: (c: ChainId) => `M${mx(405, c)} 92 Q${mx(215, c)} 100 ${mx(215, c)} 252`,
  out: (c: ChainId) => `M${mx(280, c)} 345 Q${mx(330, c)} 405 ${mx(425, c)} 405`,
  in: (c: ChainId) => `M${mx(425, c)} 405 Q${mx(330, c)} 405 ${mx(280, c)} 345`,
};
/** The path liquidity takes when it leaves `from`: out of the pool, through Across, into the other pool. */
const crossing = (from: ChainId) => {
  const to: ChainId = from === "unichain" ? "base" : "unichain";
  return { out: edges.out(from), into: edges.in(to) };
};

interface Particle { id: number; d: string; kind: Kind; dur: number }
interface Props {
  activity?: Record<ChainId, number>;
  pool?: Partial<Record<ChainId, number>>;
  flow?: { from: ChainId; to: ChainId } | null;
  bridge?: { fillSec: number; feePct: number };
  watcher?: WatcherStats;
}

const STEPS = [
  "Swaps hit the busy chain; each one is an event Reactive is subscribed to.",
  "Reactive adds them up: one chain is much busier than the other.",
  "Reactive calls the quiet chain's vault: depart.",
  "The liquidity crosses over the Across bridge.",
  "Reactive calls the busy chain's vault: arrive. The liquidity is where the trading is.",
];

export function NetworkMap({ activity, pool, flow, bridge, watcher }: Props) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [sim, setSim] = useState<{ busy: ChainId; step: number } | null>(null);
  const [shift, setShift] = useState(0); // fraction of the combined pool moved from the quiet chain to the busy one
  const [simDemand, setSimDemand] = useState<Record<ChainId, number>>({ unichain: 0, base: 0 });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const nextId = useRef(0);
  const reduced = useRef(false);

  useEffect(() => { reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches; }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const later = useCallback((ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); }, []);
  const emit = useCallback((d: string, kind: Kind, dur = 1100) => {
    if (reduced.current) return;
    const id = nextId.current++;
    setParticles((p) => [...p.slice(-40), { id, d, kind, dur }]);
    later(dur + 100, () => setParticles((p) => p.filter((x) => x.id !== id)));
  }, [later]);

  // Live mode: a small pulse along the event line for every recent swap Reactive has counted (none when quiet).
  useEffect(() => {
    if (sim || !activity) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      for (const c of CHAINS) if (Math.random() < Math.min(activity[c] / 6, 1)) emit(edges.event(c), "event", 1300);
    }, 1400);
    return () => clearInterval(id);
  }, [activity, sim, emit]);

  const run = (busy: ChainId) => {
    if (sim) return;
    const quiet: ChainId = busy === "base" ? "unichain" : "base";
    timers.current.forEach(clearTimeout); timers.current = [];
    setShift(0); setSimDemand({ unichain: 0, base: 0 });
    setSim({ busy, step: 0 });
    for (let i = 0; i < 6; i++) later(i * 280, () => { emit(edges.event(busy), "event", 1000); setSimDemand((d) => ({ ...d, [busy]: i + 1 })); });
    later(2200, () => setSim({ busy, step: 1 }));
    later(3300, () => { setSim({ busy, step: 2 }); emit(edges.callback(quiet), "callback", 1100); });
    later(4500, () => {
      setSim({ busy, step: 3 }); setShift(0.5);
      const { out, into } = crossing(quiet);
      for (let i = 0; i < 5; i++) later(i * 160, () => { emit(out, "liquidity", 1000); later(950, () => emit(into, "liquidity", 1000)); });
    });
    later(7300, () => { setSim({ busy, step: 4 }); setShift(1); emit(edges.callback(busy), "callback", 1100); });
    later(10200, () => { setSim(null); setShift(0); setSimDemand({ unichain: 0, base: 0 }); });
  };

  const stop = () => { timers.current.forEach(clearTimeout); timers.current = []; setSim(null); setShift(0); setParticles([]); setSimDemand({ unichain: 0, base: 0 }); };

  const total = (pool?.unichain ?? 0) + (pool?.base ?? 0);
  const quietOf = sim ? (sim.busy === "base" ? "unichain" : "base") : undefined;
  const poolShown = (c: ChainId): number | undefined => {
    const base = pool?.[c];
    if (base === undefined) return undefined;
    if (!sim || !quietOf) return base;
    const moved = total * 0.2 * shift;
    return c === sim.busy ? base + moved : base - moved;
  };
  const demand = (c: ChainId) => (sim ? simDemand[c] : activity?.[c]);
  const hot = sim ? (sim.step >= 1 ? sim.busy : undefined) : flow?.to;
  const fmtU = (n?: number) => (n === undefined ? "–" : Math.round(n).toLocaleString("en-US"));
  const pct = (c: ChainId) => { const v = poolShown(c); return v === undefined || !total ? 50 : Math.max(8, Math.min(92, (v / total) * 100)); };
  const pos = (n: { x: number; y: number }) => ({ left: `${(n.x / W) * 100}%`, top: `${(n.y / H) * 100}%` });

  return (
    <section className="netmap" aria-labelledby="net-title">
      <div className="net-head">
        <h3 id="net-title" className="sub">Network map</h3>
        {sim ? <span className="tag solid" role="status">Simulation: not real transactions</span> : <span className="tag"><span className="live-dot" />live numbers</span>}
        <div className="net-actions">
          {sim ? <button className="pbtn small" onClick={stop}>Stop</button> : (
            <>
              <button className="pbtn small" onClick={() => run("base")}>Simulate: Base gets busy</button>
              <button className="pbtn small" onClick={() => run("unichain")}>Simulate: Unichain gets busy</button>
            </>
          )}
        </div>
      </div>

      <div className="net-stage">
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
          {CHAINS.map((c) => (
            <g key={c}>
              <path className="ne ne-event" d={edges.event(c)} />
              <path className="ne ne-callback" d={edges.callback(c)} />
              <path className="ne ne-bridge" d={edges.out(c)} />
            </g>
          ))}
          <path className="ne ne-bridge" d={`M425 405 L575 405`} />
          {particles.map((p) => (
            <circle key={p.id} className={`np np-${p.kind}`} r={p.kind === "liquidity" ? 7 : 5}>
              <animateMotion dur={`${p.dur}ms`} path={p.d} fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .25 1" />
            </circle>
          ))}
        </svg>

        <div className={`nn nn-lasna${sim && sim.step >= 1 && sim.step <= 4 ? " think" : ""}`} style={pos(NODE.lasna)}>
          <b>Reactive Network</b>
          <span>RespoolBrain · watches both chains</span>
        </div>

        {CHAINS.map((c) => (
          <div key={c} className={`nn nn-chain${hot === c ? " hot" : ""}${sim && quietOf === c && sim.step >= 2 ? " quiet" : ""}`} style={pos(NODE[c])}>
            <b>{NAME[c]}</b>
            <span>{demand(c) === undefined ? "reading…" : `${demand(c)!.toFixed(sim ? 0 : 1)} recent swaps`}</span>
            <div className="nn-bar" aria-hidden="true"><i style={{ width: `${pct(c)}%` }} /></div>
            <span>{fmtU(poolShown(c))} pool units</span>
          </div>
        ))}

        <div className="nn nn-across" style={pos(NODE.across)}>
          <b>Across bridge</b>
          <span>{bridge ? `~${bridge.fillSec} s · ~${bridge.feePct.toFixed(2)}% fee` : "reading…"}</span>
          {watcher && <span>Reactive saw {watcher.deposits} deposit{watcher.deposits === 1 ? "" : "s"}{watcher.fills > 0 ? `, last ${watcher.lastSec} s` : ""}</span>}
        </div>
      </div>

      <ol className="net-steps" aria-label="What happens in a move">
        {STEPS.map((s, i) => <li key={i} className={sim && sim.step === i ? "on" : sim && sim.step > i ? "past" : ""}>{s}</li>)}
      </ol>
      <p className="cap dim net-legend">
        <span className="lg lg-event" /> swap events Reactive subscribes to · <span className="lg lg-callback" /> Reactive&apos;s callbacks to the vaults · <span className="lg lg-bridge" /> the path liquidity takes over Across.
        {sim ? " Simulation timing is compressed for viewing; a real move measured 3.4 s end to end (median, 5 moves)." : " Pulses on the swap lines are real recent swaps; quiet means none. Use Simulate to replay a move."}
      </p>
    </section>
  );
}
