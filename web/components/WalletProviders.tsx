"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { connectorsForWallets, lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { injectedWallet, rainbowWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { baseSepolia, unichainSepolia } from "wagmi/chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
const config = createConfig({
  chains: [baseSepolia, unichainSepolia],
  transports: { [baseSepolia.id]: http(), [unichainSepolia.id]: http() },
  connectors: connectorsForWallets([{
    groupName: "Wallets",
    wallets: projectId ? [rainbowWallet, walletConnectWallet, injectedWallet] : [injectedWallet],
  }], { appName: "Respool", projectId: projectId ?? "" }),
  ssr: true,
});

export function WalletProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={lightTheme({ accentColor: "#16162a", accentColorForeground: "#ffffff", borderRadius: "none", fontStack: "system", overlayBlur: "small" })} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
