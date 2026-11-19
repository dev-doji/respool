"use client";
// The connected wallet's raw EIP-1193 provider, once it is ready, for sending transactions.
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";

export type Wallet = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

export function useWallet() {
  const { address, chainId, connector, isConnected } = useAccount();
  const key = isConnected && connector ? `${connector.uid}:${address}:${chainId}` : "";
  const [held, setHeld] = useState<{ key: string; wallet: Wallet }>();
  const [error, setError] = useState("");

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

  return { address, chainId, isConnected, wallet: held?.key === key ? held.wallet : undefined, error };
}
