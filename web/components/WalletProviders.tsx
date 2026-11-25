"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { connectorsForWallets, darkTheme, lightTheme, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { injectedWallet, rainbowWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { currentTheme, type Theme } from "./ThemeToggle";
import { createConfig, http, WagmiProvider } from "wagmi";
import { baseSepolia, sepolia, unichainSepolia } from "wagmi/chains";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();
const config = createConfig({
  chains: [baseSepolia, unichainSepolia, sepolia],
  transports: { [baseSepolia.id]: http(), [unichainSepolia.id]: http(), [sepolia.id]: http() },
  connectors: connectorsForWallets([{
    groupName: "Wallets",
    wallets: projectId ? [rainbowWallet, walletConnectWallet, injectedWallet] : [injectedWallet],
  }], { appName: "Respool", projectId: projectId ?? "" }),
  ssr: true,
});

export function WalletProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    setTheme(currentTheme());
    const on = () => setTheme(currentTheme());
    window.addEventListener("respool-theme", on);
    return () => window.removeEventListener("respool-theme", on);
  }, []);
  const opts = { borderRadius: "none", fontStack: "system", overlayBlur: "small" } as const;

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={theme === "dark" ? darkTheme({ accentColor: "#ecebf5", accentColorForeground: "#0e0e1a", ...opts }) : lightTheme({ accentColor: "#16162a", accentColorForeground: "#ffffff", ...opts })} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
