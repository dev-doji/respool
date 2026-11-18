// Reads what a transaction actually did from its receipt, so the activity table shows chain facts, not what the
// page assumed. Pure functions with no imports, so they can be tested on their own.

export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // Transfer(address,address,uint256)
export const APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925"; // Approval(address,address,uint256)
const ZERO = "0x0000000000000000000000000000000000000000";

export type ActivityKind = "approve" | "deposit" | "withdraw";
export interface ReceiptLog { address: string; topics: string[]; data: string }
export interface Receipt { status: string; blockNumber: string; logs: ReceiptLog[] }
export interface Parties { account: string; vault: string; usdc: string }

const lower = (s: string) => s.toLowerCase();
/** An address stored in a 32-byte topic. */
const topicAddress = (topic: string | undefined) => (topic ? lower("0x" + topic.slice(26)) : "");

/**
 * The amount (in USDC base units) that this receipt shows for the given kind of action, or undefined when the
 * receipt has no matching event. deposit = vault shares minted to the account, withdraw = shares burned from the
 * account, approve = the allowance the account set for the vault.
 */
export function amountFromReceipt(kind: ActivityKind, receipt: Receipt, who: Parties): bigint | undefined {
  const account = lower(who.account), vault = lower(who.vault), usdc = lower(who.usdc);
  for (const log of receipt.logs) {
    const t = log.topics;
    if (!t || t.length < 3) continue;
    const from = topicAddress(t[1]), to = topicAddress(t[2]);
    if (kind === "approve" && lower(log.address) === usdc && t[0] === APPROVAL_TOPIC && from === account && to === vault) return BigInt(log.data);
    if (lower(log.address) !== vault || t[0] !== TRANSFER_TOPIC) continue;
    if (kind === "deposit" && from === ZERO && to === account) return BigInt(log.data);
    if (kind === "withdraw" && from === account && to === ZERO) return BigInt(log.data);
  }
  return undefined;
}

export type TxState = "checking" | "confirmed" | "failed";

export function stateFromReceipt(receipt: Receipt | null): TxState {
  if (!receipt) return "checking";
  return receipt.status === "0x1" ? "confirmed" : "failed";
}
