// Reads Respool's contracts straight from the chains over public JSON-RPC, from the browser.
// Selectors are keccak4 of the Solidity signatures (checked with `cast sig`).
import { D } from "./data";

const SEL = {
  total: "0x15770f92", // totalLiquidity()
  base: "0x1a686502", // liquidity()
  limit: "0xde961d93", // limitLiquidity()
  tl: "0x59c4f905", // tickLower()
  tu: "0x55b812a8", // tickUpper()
  ll: "0x51e87af7", // limitLower()
  lu: "0x0f35bcac", // limitUpper()
  slot0: "0xc815641c", // StateView.getSlot0(bytes32)
  lastMove: "0x7e1f21d1", // lastMoveId()
  inFlight: "0xd2e19ad4", // inFlightMove()
} as const;

type RpcChain = "base" | "unichain" | "lasna";
let rid = 0;

async function rpc(chain: RpcChain, method: string, params: unknown[]): Promise<string> {
  const res = await fetch(D.chains[chain].rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rid, method, params }),
    signal: AbortSignal.timeout(9000),
  });
  const j = (await res.json()) as { result?: string; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result as string;
}

const call = (chain: RpcChain, to: string, data: string) => rpc(chain, "eth_call", [{ to, data }, "latest"]);
const word = (hex: string, i = 0): bigint => BigInt("0x" + hex.slice(2 + i * 64, 66 + i * 64));
const sint = (b: bigint): number => Number(BigInt.asIntN(256, b));

export interface VaultState { total: bigint; base: bigint; limit: bigint; tl: number; tu: number; ll: number; lu: number; tick: number }
export interface BrainState { balance: bigint; lastMove: number; inFlight: number }

export async function readVault(chain: "base" | "unichain"): Promise<VaultState> {
  const c = D.chains[chain];
  const pool = c.poolId.slice(2);
  const [total, base, limit, tl, tu, ll, lu, s0] = await Promise.all([
    call(chain, c.vault, SEL.total), call(chain, c.vault, SEL.base), call(chain, c.vault, SEL.limit),
    call(chain, c.vault, SEL.tl), call(chain, c.vault, SEL.tu), call(chain, c.vault, SEL.ll), call(chain, c.vault, SEL.lu),
    call(chain, c.stateView, SEL.slot0 + pool),
  ]);
  return { total: word(total), base: word(base), limit: word(limit), tl: sint(word(tl)), tu: sint(word(tu)), ll: sint(word(ll)), lu: sint(word(lu)), tick: sint(word(s0, 1)) };
}

export async function readBrain(): Promise<BrainState> {
  const b = D.chains.lasna.brain;
  const [bal, last, fl] = await Promise.all([rpc("lasna", "eth_getBalance", [b, "latest"]), call("lasna", b, SEL.lastMove), call("lasna", b, SEL.inFlight)]);
  return { balance: BigInt(bal), lastMove: Number(word(last)), inFlight: Number(word(fl)) };
}
