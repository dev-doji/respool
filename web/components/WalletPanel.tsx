"use client";

import { useEffect, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { NETWORKS, networkById } from "@/lib/usdcNetworks";
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

export function WalletPanel() {
  const { address, chainId, connector, isConnected } = useAccount();
  const { switchChain, isPending: switching } = useSwitchChain();
  const [pick, setPick] = useState(NETWORKS[0].id);
  const [connection, setConnection] = useState<{ id: string; wallet: Wallet }>();
  const [error, setError] = useState("");

  // Follow the wallet when it is on a supported chain; otherwise show the chain the visitor picked.
  const connectedNetwork = isConnected ? networkById(chainId) : undefined;
  const active = connectedNetwork ?? (networkById(pick) ?? NETWORKS[0]);
  const onActive = isConnected && chainId === active.id;
  const connectionId = isConnected && connector ? connector.uid + ":" + address + ":" + chainId : "";
  const wallet = connection?.id === connectionId ? connection.wallet : undefined;

  useEffect(() => {
    if (!connectionId || !connector || chainId !== active.id) return;
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
    <div className="app-grid">
      <section className="panel" aria-labelledby="start-title">
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
      </section>

      <section className="panel" aria-labelledby="usdc-title">
        <div className="panel-head">
          <h2 id="usdc-title">Test USDC vault</h2>
          <span className="tag"><span className={`live-dot${active.vault ? "" : " off"}`} />{active.vault ? active.name : "Not deployed"}</span>
        </div>
        <div className="seg" role="group" aria-label="Network">
          {NETWORKS.map((n) => (
            <button key={n.id} type="button" aria-pressed={active.id === n.id} disabled={switching} onClick={() => choose(n.id)}>{n.name}</button>
          ))}
        </div>
        <p className="app-note">Deposit test USDC and get the same amount back as vault shares. Withdraw any time. This pilot only holds your coins: no yield, and no cross-chain moves yet.</p>
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
          : <USDCPosition key={connectionId} account={address} wallet={wallet} network={active} />}
      </section>
    </div>
  );
}

function noop() {}
