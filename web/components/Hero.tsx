"use client";
import { useEffect, useState } from "react";
import { CURRENT, D } from "@/lib/data";
import { SHORT, sec, txUrl } from "@/lib/format";
import { Comb } from "./Comb";

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

export function Hero() {
  // The stamp tells the story: the position is out of range, then a reactive callback re-centres it.
  const [fixed, setFixed] = useState(false);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setFixed(true); return; }
    const id = setTimeout(() => setFixed(true), 1500);
    return () => clearTimeout(id);
  }, []);

  const moves = D.loops.filter((l) => l.kind === "move");
  const last = moves[moves.length - 1];
  const mv = CURRENT.moves;

  return (
    <section className="hero" id="top" aria-labelledby="h1">
      <div className="hero-text">
        <p className="cap">liquidity that follows demand</p>
        <h1 id="h1">
          <span className="line">Liquidity</span>
          <span className="line">where it&apos;s</span>
          <span className="line"><mark>needed.</mark></span>
          <span className="line ghost">Across chains, in seconds.</span>
        </h1>
        <p className="lead">
          One reactive contract watches Uniswap v4 pools on Unichain Sepolia and Base Sepolia. When a position falls out of range it
          re-centres it. When trading shifts to the other chain, it moves liquidity there. No keeper server to run.
        </p>
        <div className="cta">
          <a className="pbtn dark" href="#loop">Replay a real loop <Arrow /></a>
          <a className="pbtn" href="#latency">Read the numbers</a>
        </div>
        <div className="stat">
          <div className="stat-top"><b>{mv ? `${sec(mv.median)}s` : "–"}</b><span className="rule" /></div>
          <p className="cap">{mv ? `median cross-chain move · ${mv.n} live moves, p95 ${sec(mv.p95)} s` : "no moves recorded yet"}</p>
          <div className="tags">
            <span className="tag solid"><span className="live-dot" />Live on testnet</span>
            <span className="tag">Reactive Lasna</span>
            <span className="tag">Unichain Sepolia</span>
            <span className="tag">Base Sepolia</span>
          </div>
        </div>
      </div>

      <div className="collage" aria-hidden="true">
        <div className="tile t-sky">
          <p className="cap">swap · base sepolia</p>
          <p>Price moves <span className="hit">tick 0 → −600</span>, past the vault range of −120 to 180.</p>
          <p className="cap dim">seen by the reactive contract on lasna</p>
        </div>
        <div className="tile t-ink">
          <Comb seed={3} className="comb" />
          <p className="art-word">respool</p>
        </div>
        <div className="tile t-cream">
          <p className="cap">vault · base sepolia</p>
          <span className={`stamp${fixed ? " ok" : ""}`}>{fixed ? "RECENTRED" : "OUT OF RANGE"}</span>
          <p className="cap dim">re-centred by a reactive callback</p>
        </div>
        <a
          className="tile t-pill"
          href={last?.arrivedTx ? txUrl(last.swapChain, last.arrivedTx) : "#loop"}
          target={last?.arrivedTx ? "_blank" : undefined}
          rel="noopener"
          tabIndex={-1}
        >
          <span className="bigic">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4" /></svg>
          </span>
          <span>
            <b>{last && last.srcChain ? `Moved ${SHORT[last.srcChain]} → ${SHORT[last.swapChain]}` : "Liquidity moved across chains"}</b>
            <span className="mono">{last ? `${sec(last.fullBlockMs)} s, recorded live on testnet` : "recorded live on testnet"}</span>
          </span>
        </a>
        <div className="spin-badge">
          <svg className="ring" viewBox="0 0 112 112">
            <defs><path id="circ" d="M56,56 m-42,0 a42,42 0 1,1 84,0 a42,42 0 1,1 -84,0" /></defs>
            <text><textPath href="#circ" textLength="258" lengthAdjust="spacing">TESTNET ONLY · TEST TOKENS ·</textPath></text>
          </svg>
          <span className="core">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 3v18M3 12h18" /></svg>
          </span>
        </div>
      </div>
    </section>
  );
}
