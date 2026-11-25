"use client";
// The first thing on the page: a short list of chains, best first, each with one number (what $100 would earn in a
// day, going by recent trading) and a Deposit button where this app has a vault. Read-only: it never moves money.
import { useCallback, useEffect, useRef, useState } from "react";
import { BOARD_CHAINS, explainFallback, rank, readChain, type ChainStats } from "@/lib/chainBoard";

type Say = { text: string; by: "gemini" | "rules"; note?: string };
const windowText = (s: number) => (s >= 5400 ? `${(s / 3600).toFixed(1)} h` : `${Math.max(1, Math.round(s / 60))} min`);

export function ChainBoard({ onPick }: { onPick: (chainId: number) => void }) {
  const [stats, setStats] = useState<ChainStats[]>([]);
  const [say, setSay] = useState<Say>();
  const [at, setAt] = useState<Date>();
  const running = useRef(false);

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      // Each chain is read on its own, so one slow public node leaves one row empty, not the whole list.
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
    <section className="board" aria-labelledby="board-title">
      <div className="board-head">
        <h2 id="board-title">Chains</h2>
        <span className="cap dim">{reading ? "reading…" : at ? `updated ${at.toLocaleTimeString()}` : ""}</span>
      </div>

      <ul className="chain-list">
        {ranked.map((r) => {
          const pct = r.per100PerDay && top > 0 ? Math.max(3, Math.round(Math.sqrt(r.per100PerDay / top) * 100)) : 0;
          const detail = r.status === "ok" ? `${r.swapsPerHour.toFixed(0)} swaps an hour · ${r.pools} pool${r.pools === 1 ? "" : "s"} · read over ${windowText(r.windowSec)}`
            : r.status === "quiet" ? `Too little trading to rank (${r.swaps} swap${r.swaps === 1 ? "" : "s"} in ${windowText(r.windowSec)})`
            : `Could not be read: ${r.error ?? "unavailable"}`;
          return (
            <li key={r.chain.key} className="chain-row">
              <div className="cr-name">
                <b>{r.chain.name}{r.chain.key === usable && <span className="dot" title="Best chain you can deposit to here" aria-label="Best chain you can deposit to here" />}</b>
                <span className="cap dim">{detail}</span>
              </div>
              <div className="cr-bar" role="img" aria-label={r.status === "ok" ? `${r.chain.name}: about ${r.per100PerDay!.toFixed(2)} test fees per 100 dollars a day` : `${r.chain.name}: no ranking`}><i style={{ width: `${pct}%` }} /></div>
              <div className="cr-num">{r.status === "ok" ? <><b>{r.per100PerDay!.toFixed(2)}</b><small>per $100 a day</small></> : <small>–</small>}</div>
              <div className="cr-act">
                {r.chain.vault
                  ? <button type="button" className="pbtn small" onClick={() => onPick(r.chain.id)}>Deposit</button>
                  : <span className="cap dim">Not yet</span>}
              </div>
            </li>
          );
        })}
        {reading && stats.length === 0 && <li className="cap dim" role="status">Reading the chains…</li>}
      </ul>

      {say && (
        <p className="board-say" role="status">
          {say.text}{" "}
          <span className="cap dim">{say.by === "gemini" ? "Written by Gemini from these numbers." : "From a fixed rule."}{say.note ? ` ${say.note}` : ""}</span>
        </p>
      )}

      <details className="board-how">
        <summary>How is this worked out?</summary>
        <p>The number is the test fees $100 would have earned in a day in a chain&apos;s busiest fee-charging Uniswap pool, going by its recent trading (the last half hour, or up to about six hours on a quiet chain). It is testnet trading, mostly bots, so it shows where test activity is, not real earnings. The dot marks the best chain this app can deposit to.</p>
      </details>
    </section>
  );
}
