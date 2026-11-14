import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Respool: liquidity that moves to where it's needed",
  description:
    "One reactive contract watches Uniswap v4 pools on Unichain Sepolia and Base Sepolia, re-centres positions that fall out of range, and moves liquidity to the busy chain. Testnet, with measured latency.",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%2316162a'/%3E%3Cpath d='M16 6l8.7 5v10L16 26l-8.7-5V11z' fill='%232ed3a2'/%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = { themeColor: "#f7f7fa", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Loaded by the browser, not at build time, so builds never depend on a font download (same as Beeline). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&family=Space+Grotesk:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
