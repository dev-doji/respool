"use client";
// RainbowKit's connect flow, drawn with Respool's own square buttons instead of its round default.
import { ConnectButton } from "@rainbow-me/rainbowkit";

export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, authenticationStatus, mounted }) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected = ready && account && chain && (!authenticationStatus || authenticationStatus === "authenticated");
        return (
          <div className="wbtn" {...(!ready && { "aria-hidden": true, style: { opacity: 0, pointerEvents: "none", userSelect: "none" } })}>
            {!connected ? (
              <button type="button" className="pbtn dark small" onClick={openConnectModal}>Connect wallet</button>
            ) : chain.unsupported ? (
              <button type="button" className="pbtn small wrong" onClick={openChainModal}>Wrong network</button>
            ) : (
              <>
                <button type="button" className="pbtn small" onClick={openChainModal} aria-label={`Network: ${chain.name}. Change network`}>{chain.name}</button>
                <button type="button" className="pbtn dark small" onClick={openAccountModal} aria-label={`Account ${account.displayName}. Open account menu`}>{account.displayName}</button>
              </>
            )}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
