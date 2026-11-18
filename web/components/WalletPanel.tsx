"use client";

import { useEffect, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { USDCPosition } from "./USDCPosition";
import { VaultView } from "./VaultView";

export type Wallet = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

const vaultConfigured = /^0x[\da-f]{40}$/i.test(process.env.NEXT_PUBLIC_BASE_SEPOLIA_USDC_VAULT ?? "");

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
  const [connection, setConnection] = useState<{ id: string; wallet: Wallet }>();
  const [error, setError] = useState("");
  const connectionId = isConnected && connector ? connector.uid + ":" + address + ":" + chainId : "";
  const wallet = connection?.id === connectionId ? connection.wallet : undefined;
  const onBase = isConnected && chainId === baseSepolia.id;

  useEffect(() => {
    if (!connectionId || !connector || chainId !== baseSepolia.id) return;
    let active = true;
    setError("");
    connector.getProvider({ chainId }).then((provider) => {
      const wallet = provider as Wallet | undefined;
      if (typeof wallet?.request !== "function") throw new Error("Wallet provider unavailable");
      if (active) setConnection({ id: connectionId, wallet });
    }).catch(() => {
      if (active) setError("Could not read the connected wallet. Reconnect and try again.");
    });
    return () => { active = false; };
  }, [chainId, connectionId, connector]);

  return (
    <div className="app-grid">
      <section className="panel" aria-labelledby="start-title">
        <div className="panel-head"><h2 id="start-title">Get started</h2></div>
        <ol className="todo">
          <Step n={1} done={isConnected} title="Connect a wallet">Use the button at the top right. Any browser wallet works.</Step>
          <Step n={2} done={onBase} title="Switch to Base Sepolia">This is a testnet, so it uses play money only.</Step>
          <Step n={3} title="Get test coins">
            You need test USDC and a little test ETH for gas.
            <span className="links">
              <a className="pbtn small" href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer">Get test USDC ↗</a>
              <a className="pbtn small" href="https://console.optimism.io/faucet" target="_blank" rel="noopener noreferrer">Get test ETH ↗</a>
            </span>
          </Step>
        </ol>
      </section>

      <section className="panel" aria-labelledby="usdc-title">
        <div className="panel-head">
          <h2 id="usdc-title">Test USDC vault</h2>
          <span className="tag"><span className={`live-dot${vaultConfigured ? "" : " off"}`} />{vaultConfigured ? "Base Sepolia" : "Not deployed"}</span>
        </div>
        <p className="app-note">Deposit test USDC and get the same amount back as vault shares. Withdraw any time. This pilot only holds your coins: no yield, and no cross-chain moves yet.</p>
        {!vaultConfigured ? <VaultView vault="" input="" tab="deposit" busy={false} onInput={noop} onTab={noop} onAction={noop} onRefresh={noop} />
          : !isConnected || !address ? <div className="banner" role="status"><span>Connect a wallet to see your balance and use the vault.</span></div>
          : chainId !== baseSepolia.id ? (
            <div className="banner" role="status">
              <div>
                <span>Your wallet is on another network.</span>{" "}
                <button type="button" className="pbtn small" disabled={switching} onClick={() => switchChain({ chainId: baseSepolia.id })}>{switching ? "Switching…" : "Switch to Base Sepolia"}</button>
              </div>
            </div>
          )
          : error ? <div className="banner error" role="alert"><span>{error}</span></div>
          : !wallet ? <div className="banner" role="status"><span className="spinner" aria-hidden="true" /><span>Reading your wallet connection…</span></div>
          : <USDCPosition key={connectionId} account={address} wallet={wallet} />}
      </section>
    </div>
  );
}

function noop() {}
