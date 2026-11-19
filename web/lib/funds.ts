// Where a visitor's test USDC is: in the wallet and in the vault, on every chain the vault runs on.
// Read through the public RPC, so it does not depend on which chain the wallet is currently set to.
import { balanceOfData, ethCall, word } from "./rpc.ts";

export interface ChainFunds { id: number; wallet: bigint; vault: bigint }

export async function readFunds(net: { id: number; usdc: string; vault: string; rpc: string }, account: string): Promise<ChainFunds> {
  const [wallet, vault] = await Promise.all([
    ethCall(net.rpc, net.usdc, balanceOfData(account)).then((r) => word(r)),
    net.vault ? ethCall(net.rpc, net.vault, balanceOfData(account)).then((r) => word(r)) : Promise.resolve(0n),
  ]);
  return { id: net.id, wallet, vault };
}

/** Another chain (not the one being viewed) where the visitor still has funds in the vault, if any. */
export function fundsElsewhere(funds: ChainFunds[], activeId: number): ChainFunds | undefined {
  return funds.find((f) => f.id !== activeId && f.vault > 0n);
}
