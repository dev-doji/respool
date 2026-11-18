// Everything the Liquidity Map shows, read live from the chains and from Across, in the visitor's browser.
// Each piece is read on its own, so one failing node leaves a gap with a reason, not a blank page.
import { fetchQuote, WETH } from "./across.ts";
import { D } from "./data";
import { readVault } from "./chain";
import { decayedActivity, type ChainId, type Settings } from "./recommend.ts";
import { balanceOfData, ethCall, rpc, topic, word } from "./rpc.ts";
import { NETWORKS, type UsdcNetwork } from "./usdcNetworks";

export const CHAIN_IDS: ChainId[] = ["unichain", "base"];
export const networkOf = (c: ChainId): UsdcNetwork => NETWORKS.find((n) => n.id === (c === "base" ? 84532 : 1301)) as UsdcNetwork;
export const otherOf = (c: ChainId): ChainId => (c === "base" ? "unichain" : "base");

const SEL_BRAIN_CHAIN = "0x5852cc0c"; // chain(uint256): 13 words, demand = word 8, demandBlock = word 9
const SEL_BRAIN_PARAMS = "0xcff0ab96"; // params(): word 0 = demandHalfLifeBlocks, 1 = ratioBps, 2 = minHotDemand

export interface Bridge { usdcMax: bigint; ethMax: bigint; fillSec: number; feePct: number }
export interface ChainView {
  pool?: { liquidity: bigint; tick: number };
  activity?: number;
  vaultUsdc?: bigint;
  bridge?: Bridge;
  errors: string[];
}
export interface MapData { chains: Record<ChainId, ChainView>; settings?: Settings; at: number }
export interface YouView { usdc?: bigint; eth?: bigint; shares?: bigint; error?: string }

async function brainSettings(): Promise<Settings> {
  const hex = await ethCall(D.chains.lasna.rpc, D.chains.lasna.brain, SEL_BRAIN_PARAMS);
  return { halfLifeBlocks: Number(word(hex, 0)), ratio: Number(word(hex, 1)) / 10_000, minHot: Number(word(hex, 2)) / 1e18 };
}

async function brainActivity(chain: ChainId, halfLife: number): Promise<number> {
  const id = chain === "base" ? 84532 : 1301;
  const [hex, head] = await Promise.all([
    ethCall(D.chains.lasna.rpc, D.chains.lasna.brain, SEL_BRAIN_CHAIN + topic(id).slice(2)),
    rpc<string>(D.chains.lasna.rpc, "eth_blockNumber"),
  ]);
  return decayedActivity(word(hex, 8), word(hex, 9), BigInt(head), halfLife);
}

const bridgeCache = new Map<ChainId, { at: number; value: Bridge }>();

/** Sample quotes (1 USDC, 0.001 ETH) for the bridge's limits. Sequential and cached for 20 s to stay under Across's rate limit. */
async function bridgeCapacity(chain: ChainId): Promise<Bridge> {
  const hit = bridgeCache.get(chain);
  if (hit && Date.now() - hit.at < 20_000) return hit.value;
  const from = networkOf(chain), to = networkOf(otherOf(chain));
  const usdc = await fetchQuote({ inputToken: from.usdc, outputToken: to.usdc, originChainId: from.id, destinationChainId: to.id, amount: 1_000_000n });
  const eth = await fetchQuote({ inputToken: WETH, outputToken: WETH, originChainId: from.id, destinationChainId: to.id, amount: 1_000_000_000_000_000n });
  const value = { usdcMax: usdc.maxDeposit, ethMax: eth.maxDeposit, fillSec: usdc.estimatedFillTimeSec, feePct: Number((usdc.totalRelayFee * 10_000n) / 1_000_000n) / 100 };
  bridgeCache.set(chain, { at: Date.now(), value });
  return value;
}

export async function readMap(): Promise<MapData> {
  const settings = await brainSettings().catch(() => undefined);
  const view = async (chain: ChainId): Promise<ChainView> => {
    const net = networkOf(chain);
    const errors: string[] = [];
    const [pool, activity, vaultUsdc, bridge] = await Promise.allSettled([
      readVault(chain),
      settings ? brainActivity(chain, settings.halfLifeBlocks) : Promise.reject(new Error("brain settings unavailable")),
      net.vault ? ethCall(net.rpc, net.usdc, balanceOfData(net.vault)).then((h) => word(h)) : Promise.reject(new Error("vault not deployed")),
      bridgeCapacity(chain),
    ]);
    const take = <T,>(r: PromiseSettledResult<T>, label: string): T | undefined => {
      if (r.status === "fulfilled") return r.value;
      errors.push(`${label}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
      return undefined;
    };
    const p = take(pool, "Respool pool");
    return { pool: p ? { liquidity: p.total, tick: p.tick } : undefined, activity: take(activity, "swap activity"), vaultUsdc: take(vaultUsdc, "USDC vault"), bridge: take(bridge, "bridge"), errors };
  };
  const [unichain, base] = await Promise.all([view("unichain"), view("base")]);
  return { chains: { unichain, base }, settings, at: Date.now() };
}

/** One account's money on one chain: USDC and ETH in the wallet, and USDC deposited in the Respool vault (as shares). */
export async function readYou(chain: ChainId, account: string): Promise<YouView> {
  const net = networkOf(chain);
  const [usdc, eth, shares] = await Promise.allSettled([
    ethCall(net.rpc, net.usdc, balanceOfData(account)).then((h) => word(h)),
    rpc<string>(net.rpc, "eth_getBalance", [account, "latest"]).then((h) => BigInt(h)),
    net.vault ? ethCall(net.rpc, net.vault, balanceOfData(account)).then((h) => word(h)) : Promise.resolve(0n),
  ]);
  const ok = <T,>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : undefined);
  const failed = [usdc, eth, shares].find((r) => r.status === "rejected");
  return { usdc: ok(usdc), eth: ok(eth), shares: ok(shares), error: failed ? "Could not read some balances" : undefined };
}
