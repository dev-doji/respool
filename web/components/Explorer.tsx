"use client";
// The loop player (#loop) and the latency section (#latency). One component, because clicking a dot in the
// latency plot selects that loop and replays it in the player.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CURRENT, D, type ChainKey, type Loop, type Stats } from "@/lib/data";
import { NAMES, SHORT, sec, short, txUrl } from "@/lib/format";
import { Reveal } from "./Reveal";

type KindId = "rb" | "ru" | "mv";
const KINDS: { id: KindId; label: string; test: (l: Loop) => boolean; stats: Stats }[] = [
  { id: "rb", label: "Recentre · Base", test: (l) => l.kind === "recentre" && l.swapChain === "base", stats: CURRENT.recentreBase as Stats },
  { id: "ru", label: "Recentre · Unichain", test: (l) => l.kind === "recentre" && l.swapChain === "unichain", stats: CURRENT.recentreUnichain as Stats },
  { id: "mv", label: "Move across chains", test: (l) => l.kind === "move", stats: CURRENT.moves as Stats },
];

type Estimate = false | "scaled" | "unknown";
interface Step { title: string; chain: ChainKey; tx: string | null; t: number; est: Estimate }

/** The steps of one recorded loop, with times in ms since the swap. */
function stepsFor(l: Loop): Step[] {
  const total = l.fullBlockMs;
  const out: Step[] = [];
  if (l.kind === "recentre") {
    const c = l.swapChain;
    const t1 = l.toReactiveSeenMs;
    const ok = t1 != null && t1 >= 0 && l.fullSeenMs > 0 && t1 <= l.fullSeenMs;
    out.push({ title: `Swap on ${NAMES[c]}`, chain: c, tx: l.swapTx, t: 0, est: false });
    out.push({ title: "Brain reacts on Lasna", chain: "lasna", tx: l.reactiveTx, t: ok ? ((t1 as number) / l.fullSeenMs) * total : total / 2, est: ok ? "scaled" : "unknown" });
    out.push({ title: `Vault re-centres on ${SHORT[c]}`, chain: c, tx: l.callbackTx, t: total, est: false });
    return out;
  }
  const g = l.legsSeenMs;
  const legs = [g?.swapToMoveRequested, g?.moveRequestedToDeparted, g?.departedToArriveRequested, g?.arriveRequestedToArrived];
  const known = legs.every((x): x is number => x != null && x >= 0);
  const sum = legs.reduce<number>((a, b) => a + (b ?? 0), 0);
  const ok = known && sum > 0;
  let acc = 0;
  const at = legs.map((x, i) => (ok ? ((acc += x as number), (acc / sum) * total) : ((i + 1) / 4) * total));
  const est: Estimate = ok ? "scaled" : "unknown";
  const dst = l.swapChain, src = l.srcChain as "base" | "unichain";
  out.push({ title: `Swap on ${NAMES[dst]}`, chain: dst, tx: l.swapTx, t: 0, est: false });
  out.push({ title: "Brain asks the quiet chain to depart", chain: "lasna", tx: l.reactiveTx, t: at[0], est });
  out.push({ title: `Vault burns tokens on ${SHORT[src]}`, chain: src, tx: l.departedTx, t: at[1], est });
  out.push({ title: "Brain asks the busy chain to arrive", chain: "lasna", tx: l.arriveRequestedTx, t: at[2], est });
  out.push({ title: `Vault mints and re-opens on ${SHORT[dst]}`, chain: dst, tx: l.arrivedTx, t: total, est: false });
  return out;
}

const AXIS_MAX = 5000;
const arr = (n: number) => Array.from({ length: n }, (_, i) => i);

export function Explorer() {
  const [sel, setSel] = useState<{ kind: KindId; idx: number; nonce: number }>({ kind: "rb", idx: 0, nonce: 0 });
  const [speed, setSpeed] = useState(1);
  const kindDef = KINDS.find((k) => k.id === sel.kind) as (typeof KINDS)[number];
  const loops = useMemo(() => D.loops.filter(kindDef.test), [kindDef]);
  const loop = loops[sel.idx];
  const steps = useMemo(() => stepsFor(loop), [loop]);
  const total = loop.fullBlockMs;

  // t is the player clock in ms. It starts at "finished" so the server-rendered page shows a complete loop.
  const [t, setT] = useState(total);
  const [announce, setAnnounce] = useState("");
  const touched = useRef(false); // no autoplay until the visitor interacts
  const reduce = useRef(false);

  useEffect(() => { reduce.current = matchMedia("(prefers-reduced-motion: reduce)").matches; }, []);

  useEffect(() => {
    if (!touched.current) { setT(total); return; }
    const done = () => setAnnounce(`Loop finished in ${sec(total)} seconds: ${steps.map((s) => s.title).join(", then ")}.`);
    if (reduce.current) { setT(total); done(); return; }
    let raf = 0;
    const start = performance.now(), dur = total / speed;
    setT(0); setAnnounce("");
    const tick = (now: number) => {
      const x = Math.min(total, ((now - start) / dur) * total);
      setT(x);
      if (x < total) raf = requestAnimationFrame(tick); else done();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sel.kind, sel.idx, sel.nonce, speed, total, steps]);

  const choose = useCallback((kind: KindId, idx: number) => {
    touched.current = true;
    const n = D.loops.filter((KINDS.find((k) => k.id === kind) as (typeof KINDS)[number]).test).length;
    setSel((s) => ({ kind, idx: Math.max(0, Math.min(n - 1, idx)), nonce: s.nonce + 1 }));
  }, []);

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("input,textarea")) return;
    if (e.key === "ArrowLeft") choose(sel.kind, sel.idx - 1);
    else if (e.key === "ArrowRight") choose(sel.kind, sel.idx + 1);
  };

  const wholeSecond = loop.kind === "recentre" && loop.swapChain === "unichain";
  const anyScaled = steps.some((s) => s.est === "scaled");
  const anyUnknown = steps.some((s) => s.est === "unknown");
  let last = -1;
  steps.forEach((s, i) => { if (s.t <= t + 0.001) last = i; });

  return (
    <>
      {/* ---------------- loop player ---------------- */}
      <Reveal as="section" className="sec" id="loop" aria-labelledby="loop-h" onKeyDown={onKey}>
        <div className="sec-head">
          <h2 id="loop-h">Event. Reactive. <span className="ghost">Callback.</span></h2>
          <p className="cap">every loop here is a real one, recorded on testnet. pick one and replay it.</p>
        </div>
        <div className="player">
          <div className="player-bar">
            <div className="seg" role="group" aria-label="Loop type">
              {KINDS.map((k) => (
                <button key={k.id} type="button" aria-pressed={sel.kind === k.id} onClick={() => choose(k.id, 0)}>{k.label}</button>
              ))}
            </div>
            <div className="ctrls">
              <div className="stepper">
                <button className="icon-btn" aria-label="Previous loop" disabled={sel.idx === 0} onClick={() => choose(sel.kind, sel.idx - 1)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 6l-6 6 6 6" /></svg>
                </button>
                <span aria-live="polite">Loop {sel.idx + 1} of {loops.length}</span>
                <button className="icon-btn" aria-label="Next loop" disabled={sel.idx === loops.length - 1} onClick={() => choose(sel.kind, sel.idx + 1)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 6l6 6-6 6" /></svg>
                </button>
              </div>
              <div className="seg" role="group" aria-label="Playback speed">
                {([[1, "Real time"], [0.25, "Slow-mo"]] as const).map(([v, label]) => (
                  <button key={v} type="button" aria-pressed={speed === v} onClick={() => { touched.current = true; setSpeed(v); }}>{label}</button>
                ))}
              </div>
              <button className="pbtn dark small" onClick={() => choose(sel.kind, sel.idx)}>Replay</button>
            </div>
          </div>
          <div className="stage">
            <div className="clock"><b aria-hidden="true">{sec(t, 2)}</b><span className="mono">seconds since the swap</span></div>
            <div className="track" aria-hidden="true"><div className="fill" style={{ width: `${Math.min(100, (t / total) * 100)}%` }} /></div>
            <ol className="nodes">
              {steps.map((s, i) => {
                const on = s.t <= t + 0.001;
                const at = s.est === "unknown" ? "split not measured" : `${s.est ? "≈ " : "t + "}${sec(s.t, 2)} s`;
                const basis = s.est === "scaled" ? "wall clock, scaled" : s.est === "unknown" ? "ordering only" : "block clock";
                return (
                  <li key={`${loop.i}-${i}`} className={`node${on ? " on" : ""}${i === last && t < total ? " now" : ""}`}>
                    <span className="ix">{i + 1}</span>
                    <div>
                      <b>{s.title}</b>
                      <div className="meta">
                        <span className={`chain ${s.chain}`}>{SHORT[s.chain]}</span>
                        {s.tx && <a className="mono" href={txUrl(s.chain, s.tx)} target="_blank" rel="noopener" aria-label={`Open transaction ${i + 1} on the ${NAMES[s.chain]} explorer`}>{short(s.tx)} ↗</a>}
                      </div>
                    </div>
                    <div className="at">{at}<em>{basis}</em></div>
                  </li>
                );
              })}
            </ol>
            <p className="sr-only" aria-live="polite">{announce}</p>
          </div>
          <div className="player-foot">
            <span className="cap">
              full loop {sec(total, wholeSecond || loop.kind === "move" ? 0 : 1)} s{wholeSecond ? " (whole-second clock, ±1 s)" : ""} · swap block #{loop.swapBlock.toLocaleString("en-US")}
            </span>
            <span className="cap dim">
              {anyUnknown
                ? "In-between times could not be measured for this loop (one chain's clock is whole seconds), so the steps show order only."
                : anyScaled ? "The total is the chains' block clock. In-between steps are the observer's wall clock, scaled to that total." : ""}
            </span>
          </div>
        </div>
      </Reveal>

      {/* ---------------- latency ---------------- */}
      <Reveal as="section" className="sec" id="latency" aria-labelledby="lat-h">
        <div className="sec-head">
          <h2 id="lat-h">Seconds, <span className="ghost">measured.</span></h2>
          <p className="cap">median and p95 for the current batch. full-loop time from the chains' own block timestamps.</p>
        </div>
        <div className="bento">
          {([
            ["sky", "Recentre · Base Sepolia", CURRENT.recentreBase as Stats, ""],
            ["", "Recentre · Unichain Sepolia", CURRENT.recentreUnichain as Stats, " · whole-second clock, ±1 s"],
            ["ink", "Move across chains", CURRENT.moves as Stats, " · small sample"],
          ] as const).map(([cls, title, s, extra]) => (
            <div key={title} className={`card ${cls}`} style={{ minHeight: 230 }}>
              <span className="sub">{title}</span>
              <div className="big">{sec(s.median)}<small>s</small></div>
              <p>median · p95 {sec(s.p95)} s · {s.n} loops{extra}</p>
            </div>
          ))}
        </div>

        <div className="plot">
          <h3>Every loop, one dot each</h3>
          <p className="cap">click a dot to replay it above. the green line is the median, the dashed red line is p95.</p>
          <div>
            {KINDS.map((k) => {
              const ls = D.loops.filter(k.test);
              const buckets: Record<number, number> = {};
              let maxStack = 1;
              const dots = ls.map((l, i) => {
                const b = Math.round(l.fullBlockMs / 100);
                const stack = (buckets[b] = (buckets[b] ?? 0) + 1);
                maxStack = Math.max(maxStack, stack);
                return { l, i, stack };
              });
              return (
                <div className="row" key={k.id}>
                  <div>
                    <b style={{ fontFamily: "var(--g)", fontSize: 15, letterSpacing: "-.02em" }}>{k.label}</b>
                    <div className="cap dim">{ls.length} loops</div>
                  </div>
                  <div className="axis" style={{ height: Math.max(36, maxStack * 11 + 14) }}>
                    <span className="med" style={{ left: `${(k.stats.median / AXIS_MAX) * 100}%` }} aria-hidden="true" />
                    <span className="p95" style={{ left: `${(k.stats.p95 / AXIS_MAX) * 100}%` }} aria-hidden="true" />
                    {dots.map(({ l, i, stack }) => (
                      <button
                        key={i} type="button" className={`dot${sel.kind === k.id && sel.idx === i ? " sel" : ""}`}
                        style={{ left: `${(l.fullBlockMs / AXIS_MAX) * 100}%`, bottom: (stack - 1) * 11 - 1 }}
                        aria-label={`${k.label}, loop ${i + 1}: ${sec(l.fullBlockMs)} seconds. Replay it.`} title={`${sec(l.fullBlockMs)} s`}
                        onClick={() => { choose(k.id, i); document.getElementById("loop")?.scrollIntoView({ behavior: reduce.current ? "auto" : "smooth" }); }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="scale"><span /><div>{arr(6).map((s) => <span key={s}>{s} s</span>)}</div></div>
          <div className="legend">
            <span><i style={{ background: "var(--ink)" }} />one loop</span>
            <span><i style={{ background: "var(--accent)", border: "1px solid var(--ink)" }} />selected</span>
            <span><i style={{ borderLeft: "2px solid var(--accent-deep)", width: 0, height: 11 }} />median</span>
            <span><i style={{ borderLeft: "1px dashed var(--bad)", width: 0, height: 11 }} />p95</span>
          </div>
        </div>

        <details className="more">
          <summary>All four batches, as a table <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg></summary>
          <div className="tablewrap">
            <table>
              <thead><tr><th>Batch</th><th>Recentre Base</th><th>Recentre Unichain</th><th>Moves</th><th>Moves went</th><th>Top-ups</th></tr></thead>
              <tbody>
                {D.batches.map((b) => {
                  const cell = (s: Stats | null) => (s ? <>{sec(s.median)} s <span className="cap dim">(p95 {sec(s.p95)}, n {s.n})</span></> : "–");
                  return (
                    <tr key={b.id} className={b.current ? "cur" : ""}>
                      <td><b>{b.label}</b><br /><span className="cap dim">{b.note}</span></td>
                      <td>{cell(b.recentreBase)}</td><td>{cell(b.recentreUnichain)}</td><td>{cell(b.moves)}</td>
                      <td>{b.moves ? `${b.movesIntoBase} to Base, ${b.movesIntoUnichain} to Unichain` : "–"}</td>
                      <td>{b.topups}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
        <p className="cap" style={{ marginTop: 14, maxWidth: 760 }}>
          Unichain Sepolia timestamps are whole seconds, so its numbers carry ±1 s. Five moves is a small sample. There is no Ethereum Sepolia baseline yet.
          Earlier batches moved liquidity one way only; the rule was reworked, and the table shows that history rather than hiding it.
        </p>
      </Reveal>
    </>
  );
}
