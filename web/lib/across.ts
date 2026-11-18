// Across bridge (testnet): quotes, the exact deposit call, and finding the fill on the destination chain.
// Verified against a real transfer: 0.001 ETH Unichain Sepolia -> Base Sepolia, deposit ID 6100 (see tests).
import { encodeFunctionData, parseAbi, type Hex } from "viem";
import { rpc, topic } from "./rpc.ts";

export const ACROSS_API = "https://testnet.across.to/api";
/** Across SpokePool on each testnet chain (checked on chain: live, not paused). Keyed by chain id. */
export const SPOKE_POOLS: Record<number, string> = {
  1301: "0x6999526e507Cc3b03b180BbE05E1Ff938259A874", // Unichain Sepolia
  84532: "0x82B564983aE7274c86695917BBf8C99ECb6F0F8F", // Base Sepolia
};
/** Wrapped ETH on both OP Stack chains. Across moves native ETH as WETH. */
export const WETH = "0x4200000000000000000000000000000000000006";
/** event FundsDeposited, emitted by the origin SpokePool. Topics: [sig, destinationChainId, depositId, depositor]. */
export const FUNDS_DEPOSITED_TOPIC = "0x32ed1a409ef04c7b0227189c3a103dc5ac10e775a15b785dcc510201f7c25ad3";
/** event FilledRelay, emitted by the destination SpokePool. Topics: [sig, originChainId, depositId, relayer]. */
export const FILLED_RELAY_TOPIC = "0x44b559f101f8fbcc8a0ea43fa91a05a729a5ea6e14a7c75aa750374690137208";

const spokeAbi = parseAbi([
  "function depositV3(address depositor, address recipient, address inputToken, address outputToken, uint256 inputAmount, uint256 outputAmount, uint256 destinationChainId, address exclusiveRelayer, uint32 quoteTimestamp, uint32 fillDeadline, uint32 exclusivityParameter, bytes message) payable",
]);
const erc20Abi = parseAbi(["function approve(address spender, uint256 amount) returns (bool)"]);

export interface Quote {
  timestamp: number;
  fillDeadline: number;
  outputAmount: bigint;
  exclusiveRelayer: string;
  exclusivityDeadline: number;
  totalRelayFee: bigint;
  estimatedFillTimeSec: number;
  spokePool: string;
  destinationSpokePool: string;
  minDeposit: bigint;
  maxDeposit: bigint;
  isAmountTooLow: boolean;
}

export interface QuoteRequest { inputToken: string; outputToken: string; originChainId: number; destinationChainId: number; amount: bigint }

export async function fetchQuote(r: QuoteRequest): Promise<Quote> {
  const url = `${ACROSS_API}/suggested-fees?inputToken=${r.inputToken}&outputToken=${r.outputToken}&originChainId=${r.originChainId}&destinationChainId=${r.destinationChainId}&amount=${r.amount}`;
  // The public API throttles bursts, so retry briefly on a network error, 429 or 5xx before giving up.
  let res: Response | undefined, j: Record<string, any> = {}, last = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      j = (await res.json()) as Record<string, any>;
      if (res.ok && !j.code && !j.message) break;
      last = String(j.message ?? `Across returned ${res.status}`);
      if (res.status !== 429 && res.status < 500) break; // a real rejection (bad amount, no route): do not retry
    } catch (e) {
      last = e instanceof Error ? e.message : "network error";
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
  }
  if (!res || !res.ok || j.code || j.message) throw new Error(last || "Across did not answer");
  return {
    timestamp: Number(j.timestamp),
    fillDeadline: Number(j.fillDeadline),
    outputAmount: BigInt(j.outputAmount),
    exclusiveRelayer: String(j.exclusiveRelayer),
    exclusivityDeadline: Number(j.exclusivityDeadline),
    totalRelayFee: BigInt(j.totalRelayFee.total),
    estimatedFillTimeSec: Number(j.estimatedFillTimeSec),
    spokePool: String(j.spokePoolAddress),
    destinationSpokePool: String(j.destinationSpokePoolAddress),
    minDeposit: BigInt(j.limits.minDeposit),
    maxDeposit: BigInt(j.limits.maxDeposit),
    isAmountTooLow: Boolean(j.isAmountTooLow),
  };
}

export interface Call { to: string; data: Hex; value: bigint }

/** The depositV3 call. For native ETH, inputToken and outputToken are WETH and the amount is sent as msg.value. */
export function depositCall(a: {
  depositor: string; recipient: string; inputToken: string; outputToken: string; inputAmount: bigint;
  destinationChainId: number; quote: Quote; native: boolean;
}): Call {
  const data = encodeFunctionData({
    abi: spokeAbi,
    functionName: "depositV3",
    args: [
      a.depositor as Hex, a.recipient as Hex, a.inputToken as Hex, a.outputToken as Hex, a.inputAmount, a.quote.outputAmount,
      BigInt(a.destinationChainId), a.quote.exclusiveRelayer as Hex, a.quote.timestamp, a.quote.fillDeadline, a.quote.exclusivityDeadline, "0x",
    ],
  });
  return { to: a.quote.spokePool, data, value: a.native ? a.inputAmount : 0n };
}

export function approveCall(token: string, spender: string, amount: bigint): Call {
  return { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender as Hex, amount] }), value: 0n };
}

export interface LogLike { address: string; topics: string[] }

/** The deposit ID the origin SpokePool assigned, read from the deposit's receipt. */
export function depositIdFromReceipt(receipt: { logs: LogLike[] }, spokePool: string): bigint | undefined {
  const log = receipt.logs.find((l) => l.address.toLowerCase() === spokePool.toLowerCase() && l.topics[0] === FUNDS_DEPOSITED_TOPIC);
  return log ? BigInt(log.topics[2]) : undefined;
}

export interface Fill { tx: string; block: number; timestamp: number }

/**
 * Looks for the fill of a deposit among the destination SpokePool's most recent `windowBlocks` blocks.
 * (Public RPCs cap eth_getLogs ranges: 200 blocks on Base, 1,000 on Unichain, so callers poll with a small window.)
 */
export async function findFill(rpcUrl: string, spokePool: string, originChainId: number, depositId: bigint, windowBlocks: number): Promise<Fill | null> {
  const head = Number(BigInt(await rpc<string>(rpcUrl, "eth_blockNumber")));
  const logs = await rpc<{ transactionHash: string; blockNumber: string; blockTimestamp?: string }[]>(rpcUrl, "eth_getLogs", [{
    address: spokePool,
    fromBlock: "0x" + Math.max(0, head - windowBlocks + 1).toString(16),
    toBlock: "0x" + head.toString(16),
    topics: [FILLED_RELAY_TOPIC, topic(originChainId), topic(depositId)],
  }]);
  const log = logs[0];
  if (!log) return null;
  let timestamp = log.blockTimestamp ? Number(BigInt(log.blockTimestamp)) : 0;
  if (!timestamp) {
    const block = await rpc<{ timestamp: string }>(rpcUrl, "eth_getBlockByNumber", [log.blockNumber, false]);
    timestamp = Number(BigInt(block.timestamp));
  }
  return { tx: log.transactionHash, block: Number(BigInt(log.blockNumber)), timestamp };
}

/** Block time in whole seconds. */
export async function blockTimestamp(rpcUrl: string, blockNumberHex: string): Promise<number> {
  const block = await rpc<{ timestamp: string }>(rpcUrl, "eth_getBlockByNumber", [blockNumberHex, false]);
  return Number(BigInt(block.timestamp));
}
