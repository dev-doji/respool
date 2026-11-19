"use client";

import { useEffect, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { NETWORKS, networkById } from "@/lib/usdcNetworks";
import { FundsAcrossChains } from "./FundsAcrossChains";
import { USDCPosition } from "./USDCPosition";
import { VaultView } from "./VaultView";

export type Wallet = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

function Step({ n, done, title, children }: { n: number; done?: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className={done ? "done" : ""}>
      <span className="dotn" aria-hidden="true">{done ? "✓" : n}</span>
      <div><b>{title}{done && <span className="sr-only"> (done)</span>}</b><p>{children}</p></div>
    </li>
  );
}

export function WalletPanel({ embedded = false, preferChainId, onChanged }: { embedded?: boolean; preferChainId?: number; onChanged?: () => void }) {
  const { address, chainId, connector, isConnected } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [pick, setPick] = useState(NETWORKS[0].id);
  const [connection, setConnection] = useState<{ id: string; wallet: Wallet }>();
  const [error, setError] = useState("");

  // Follow the wallet when it is on a supported chain; otherwise show the chain the visitor picked.
  const connectedNetwork = isConnected ? networkById(chainId) : undefined;
  const active = connectedNetwork ?? (networkById(pick) ?? NETWORKS[0]);
  const onActive = isConnected && chainId === active.id;
  // The page can ask for a chain (where liquidity is needed): follow it unless the wallet is on a supported chain.
  useEffect(() => { if (preferChainId && networkById(preferChainId)) setPick(preferChainId); }, [preferChainId]);
  const connectionId = isConnected && connector ? connector.uid + ":" + address + ":" + chainId : "";
  const wallet = connection?.id === connectionId ? connection.wallet : undefined;

  useEffect(() => {
    // While a saved connection is being restored the connector can be a plain record without getProvider yet: wait for the real one.
    if (!connectionId || !connector || typeof connector.getProvider !== "function" || chainId !== active.id) return;
    let live = true;
    setError("");
    connector.getProvider({ chainId }).then((provider) => {
      const wallet = provider as Wallet | undefined;
      if (typeof wallet?.request !== "function") throw new Error("Wallet provider unavailable");
      if (live) setConnection({ id: connectionId, wallet });
    }).catch(() => {
      if (live) setError("Could not read the connected wallet. Reconnect and try again.");
    });
    return () => { live = false; };
  }, [chainId, connectionId, connector, active.id]);

  const choose = (id: number) => {
    setPick(id);
    if (isConnected && chainId !== id) switchChain({ chainId: id });
  };

  return (
    <div className={`app-grid${embedded ? " embedded" : ""}`}>
      {!embedded && <section className="panel" aria-labelledby="start-title">
        <div className="panel-head"><h2 id="start-title">Get started</h2></div>
        <ol className="todo">
          <Step n={1} done={isConnected} title="Connect a wallet">Use the button at the top right. Any browser wallet works.</Step>
          <Step n={2} done={!!connectedNetwork} title="Pick a network">Base Sepolia and Unichain Sepolia both work. Choose one on the right. They are testnets, so it is play money only.</Step>
          <Step n={3} title="Get test coins">
            You need test USDC and a little test ETH for gas on {active.name}.
            <span className="links">
              <a className="pbtn small" href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">Get test USDC ↗</a>
              <a className="pbtn small" href={active.ethFaucet} target="_blank" rel="noopener noreferrer">Get test ETH ↗</a>
            </span>
          </Step>
        </ol>
      </section>}

      <section className="panel" aria-labelledby="usdc-title">
        <div className="panel-head">
          <h2 id="usdc-title">{embedded ? "Deposit and earn" : "Test USDC vault"}</h2>
          <span className="tag"><span className={`live-dot${active.vault ? "" : " off"}`} />{active.vault ? active.name : "Not deployed"}</span>
        </div>
        <div className="seg" role="group" aria-label="Network">
          {NETWORKS.map((n) => (
            <button key={n.id} type="button" aria-pressed={active.id === n.id} disabled={switching} onClick={() => choose(n.id)}>{n.name}</button>
          ))}
        </div>
        {isConnected && address && <FundsAcrossChains account={address} activeId={active.id} switching={switching} onSwitch={choose} />}
        <p className="app-note">Deposit test USDC and get the same amount back, any time. While it is deposited it earns test rewards (a worthless test token paid by the vault, not trading fees). Need test coins? <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">Test USDC ↗</a> · <a href={active.ethFaucet} target="_blank" rel="noopener noreferrer">Test ETH ↗</a></p>
        {!active.vault ? <VaultView network={active} vault="" input="" tab="deposit" busy={false} onInput={noop} onTab={noop} onAction={noop} onRefresh={noop} />
          : !isConnected || !address ? <div className="banner" role="status"><span>Connect a wallet to see your balance and use the vault.</span></div>
          : !onActive ? (
            <div className="banner" role="status">
              <div>
                <span>Your wallet is on another network.</span>{" "}
                <button type="button" className="pbtn small" disabled={switching} onClick={() => switchChain({ chainId: active.id })}>{switching ? "Switching…" : `Switch to ${active.name}`}</button>
              </div>
            </div>
          )
          : error ? <div className="banner error" role="alert"><span>{error}</span></div>
          : !wallet ? <div className="banner" role="status"><span className="spinner" aria-hidden="true" /><span>Reading your wallet connection…</span></div>
          : <USDCPosition key={connectionId} account={address} wallet={wallet} network={active} onChanged={onChanged} />}
      </section>
    </div>
  );
}

function noop() {}
