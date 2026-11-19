"use client";
// "Where to put your money": one bar per supported testnet, longest where each deposited dollar would have earned
// the most test fees in the last half hour, with a two-sentence suggestion. Read-only: it never moves money.
import { useCallback, useEffect, useRef, useState } from "react";
import { BOARD_CHAINS, explainFallback, rank, readChain, type ChainStats } from "@/lib/chainBoard";

type Say = { text: string; by: "gemini" | "rules"; note?: string };
const windowText = (s: number) => (s >= 5400 ? `${(s / 3600).toFixed(1)} h` : `${Math.max(1, Math.round(s / 60))} min`);

export function ChainBoard() {
  const [stats, setStats] = useState<ChainStats[]>([]);
  const [say, setSay] = useState<Say>();
  const [at, setAt] = useState<Date>();
  const running = useRef(false);

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      // Each chain is read on its own, so one slow public node leaves one row empty, not the whole board.
      const done: ChainStats[] = [];
      await Promise.all(BOARD_CHAINS.map(async (c) => {
        done.push(await readChain(c));
        setStats([...done]);
      }));
      const ranked = rank(done);
      setAt(new Date());
      setSay({ text: explainFallback(ranked), by: "rules" });
      // Ask Gemini (through the site's own endpoint) to put it in plain words. It only ever sees these numbers.
      fetch("/api/explain", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(ranked.map((r) => ({ name: r.chain.name, status: r.status, swapsPerHour: r.swapsPerHour, per100PerDay: r.per100PerDay ?? null, canDeposit: r.chain.vault }))),
      }).then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string; status?: number };
        if (res.ok && body.text) setSay({ text: body.text, by: "gemini" });
        else setSay((s) => (s ? { ...s, note: body.error ? `Gemini did not answer (${body.error}${body.status ? " " + body.status : ""}).` : "Gemini did not answer." } : s));
      }).catch(() => setSay((s) => (s ? { ...s, note: "Gemini could not be reached." } : s)));
    } finally { running.current = false; }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => { if (!document.hidden) void refresh(); }, 90_000);
    return () => clearInterval(id);
  }, [refresh]);

  const ranked = rank(stats);
  const top = Math.max(0, ...ranked.map((r) => r.per100PerDay ?? 0));
  const usable = ranked.find((r) => r.chain.vault && r.status === "ok")?.chain.key;
  const reading = stats.length < BOARD_CHAINS.length;

  return (
    <section className="panel board" aria-labelledby="board-title">
      <div className="panel-head">
        <h2 id="board-title">Where to put your money</h2>
        <span className="tag"><span className={`live-dot${reading ? " off" : ""}`} />{reading ? "reading…" : at ? `updated ${at.toLocaleTimeString()}` : ""}</span>
      </div>
      <p className="app-note">Each bar is the test fees $100 would have earned in a day on that chain, going by recent Uniswap trading there (the last half hour, or up to six hours on a quiet chain). Longer is better. It is testnet trading, mostly bots, so it shows where test activity is, not real earnings.</p>

      <ul className="bars">
        {ranked.map((r, i) => {
          const pct = r.per100PerDay && top > 0 ? Math.max(4, Math.round(Math.sqrt(r.per100PerDay / top) * 100)) : 0;
          return (
            <li key={r.chain.key}>
              <div className="bar-top">
                <b>{r.chain.name}{i === 0 && r.status === "ok" && <span className="best">{r.chain.vault ? "best now" : "highest"}</span>}{r.chain.key === usable && !(i === 0) && <span className="best">best to use here</span>}</b>
                <span className="cap dim">{r.chain.vault ? "deposit here" : "compare only"}</span>
              </div>
              <div className="bar" role="img" aria-label={r.status === "ok" ? `${r.chain.name}: about ${r.per100PerDay!.toFixed(2)} test fees per 100 dollars a day` : `${r.chain.name}: ${r.status === "quiet" ? "too little trading to rank" : "could not be read"}`}>
                <i style={{ width: `${pct}%` }} />
              </div>
              <div className="bar-note cap">
                {r.status === "ok" ? `${r.per100PerDay!.toFixed(2)} per $100 a day · ${r.swapsPerHour.toFixed(0)} swaps an hour in its busiest pool · ${r.pools} active pool${r.pools === 1 ? "" : "s"} · read over ${windowText(r.windowSec)}`
                  : r.status === "quiet" ? `Too little trading to rank (${r.swaps} swap${r.swaps === 1 ? "" : "s"} in ${windowText(r.windowSec)})`
                  : `Could not be read: ${r.error ?? "unavailable"}. It retries on the next refresh.`}
              </div>
            </li>
          );
        })}
        {reading && <li className="cap dim" role="status">Reading the chains…</li>}
      </ul>

      {say && (
        <div className="banner reco" role="status">
          <div>
            <span className="sub">{say.by === "gemini" ? "Suggestion, written by Gemini from these numbers" : "Suggestion, from a fixed rule"}</span>
            <span style={{ display: "block" }}>{say.text}</span>
            {say.note && <span className="hint">{say.note} This sentence comes from a fixed rule.</span>}
          </div>
        </div>
      )}
    </section>
  );
}
