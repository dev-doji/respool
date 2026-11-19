"use client";
// The connected wallet's raw EIP-1193 provider, once it is ready, for sending transactions.
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

export type Wallet = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
};

export function useWallet() {
  const { address, chainId, connector, isConnected } = useAccount();
  const key = isConnected && connector ? `${connector.uid}:${address}:${chainId}` : "";
  const [held, setHeld] = useState<{ key: string; wallet: Wallet }>();
  const [error, setError] = useState("");
  // The chain the wallet itself reports. wagmi's copy can lag or go stale, which showed "Switch to Base" on Base.
  const [live, setLive] = useState<{ key: string; id: number }>();

  useEffect(() => {
    // While a saved connection is being restored the connector can be a plain record without getProvider yet: wait for the real one.
    if (!key || !connector || typeof connector.getProvider !== "function") return;
    let live = true;
    setError("");
    connector.getProvider({ chainId }).then((provider) => {
      const wallet = provider as Wallet | undefined;
      if (typeof wallet?.request !== "function") throw new Error("Wallet provider unavailable");
      if (live) setHeld({ key, wallet });
    }).catch(() => {
      if (live) setError("Could not read the connected wallet. Reconnect and try again.");
    });
    return () => { live = false; };
  }, [key, connector, chainId]);

  const provider = held?.key === key ? held.wallet : undefined;
  useEffect(() => {
    if (!provider || !key) return;
    let on = true;
    const set = (hex: unknown) => { const id = Number(hex); if (on && Number.isFinite(id)) setLive({ key, id }); };
    provider.request({ method: "eth_chainId" }).then(set).catch(() => {});
    provider.on?.("chainChanged", set);
    return () => { on = false; provider.removeListener?.("chainChanged", set); };
  }, [provider, key]);
  const walletChain = live?.key === key ? live.id : chainId;

  return { address, chainId: walletChain, isConnected, wallet: held?.key === key ? held.wallet : undefined, error };
}
