// "Where is liquidity needed?" Pure functions, mirroring the rule the Reactive brain itself uses
// (a chain is "hot" when its recent swap activity is at least `ratio` times the other's and above a noise floor).
export type ChainId = "unichain" | "base";

export interface Settings { ratio: number; minHot: number; halfLifeBlocks: number }
export interface Recommendation { from: ChainId; to: ChainId; hot: number; cold: number }

/**
 * Recent swap activity, in swaps, brought up to date. The brain stores demand (1e18 per swap) as of `demandBlock` and
 * fades it by `d * H / (H + elapsed)`; a page read later has to apply the same fade or it would show stale activity.
 */
export function decayedActivity(demand: bigint, demandBlock: bigint, headBlock: bigint, halfLifeBlocks: number): number {
  if (demand === 0n || demandBlock === 0n || halfLifeBlocks <= 0) return 0;
  const elapsed = headBlock > demandBlock ? Number(headBlock - demandBlock) : 0;
  return (Number(demand) / 1e18) * (halfLifeBlocks / (halfLifeBlocks + elapsed));
}

export function recommend(activity: Record<ChainId, number>, s: Pick<Settings, "ratio" | "minHot">): Recommendation | null {
  const hot: ChainId = activity.unichain >= activity.base ? "unichain" : "base";
  const cold: ChainId = hot === "unichain" ? "base" : "unichain";
  if (activity[hot] < s.minHot) return null;
  if (activity[hot] < s.ratio * activity[cold]) return null;
  return { from: cold, to: hot, hot: activity[hot], cold: activity[cold] };
}
