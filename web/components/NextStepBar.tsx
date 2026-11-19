"use client";
// One line that says what to do next, from the visitor's balances and where Reactive says liquidity is needed.
import { useCallback, useEffect, useRef, useState } from "react";
import { readMap, readYou, type MapData, type YouView } from "@/lib/liquidity";
import { nextStep } from "@/lib/flow";
import { recommend, type ChainId } from "@/lib/recommend";

export function NextStepBar({ account, refreshKey, onMove, onVault }: {
  account?: string; refreshKey: number;
  onMove: (from: ChainId) => void;
  onVault: (chain: ChainId, kind: "deposit" | "withdraw") => void;
}) {
  const [data, setData] = useState<MapData>();
  const [you, setYou] = useState<Partial<Record<ChainId, YouView>>>({});
  const running = useRef(false);

  const refresh = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const [map, uni, base] = await Promise.all([
        readMap(),
        account ? readYou("unichain", account) : Promise.resolve(undefined),
        account ? readYou("base", account) : Promise.resolve(undefined),
      ]);
      setData(map); setYou({ unichain: uni, base });
    } catch { /* keep the last reading; the next refresh retries */ } finally { running.current = false; }
  }, [account]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => { if (!document.hidden) void refresh(); }, 15000);
    return () => clearInterval(id);
  }, [refresh, refreshKey]);

  const a = data?.chains;
  const activity = a && a.unichain.activity !== undefined && a.base.activity !== undefined ? { unichain: a.unichain.activity, base: a.base.activity } : undefined;
  const rec = activity && data?.settings ? recommend(activity, data.settings) : null;
  const step = nextStep({ hasAccount: !!account, rec: rec ? { from: rec.from, to: rec.to } : null, you });
  const act = step.action;

  return (
    <div className={`banner nextstep${step.tone === "go" ? " reco hot" : step.tone === "ok" ? " ok" : ""}`} role="status">
      <div>
        <b style={{ display: "block", fontSize: 16 }}>{step.title}</b>
        <span className="hint">{step.text}</span>
      </div>
      {act && (
        <button className="pbtn dark small" onClick={() => (act.kind === "move" ? onMove(act.chain) : onVault(act.chain, act.kind))}>{act.label}</button>
      )}
    </div>
  );
}
