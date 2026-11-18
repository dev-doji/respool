# Respool handoff

## Current implementation

- The original Lasna brain, test-token Uniswap v4 vaults, latency observer, and dashboard remain available.
- The wallet panel at /app uses RainbowKit and wagmi for wallet discovery, account changes and network switching. Browser extensions are discovered without configuration. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in web/.env.local to enable Rainbow mobile and WalletConnect QR pairing. The selected connector handles vault transactions.
- The Base Sepolia USDC pilot adds a separate custody vault. Users approve Circle's test USDC, deposit, receive transferable rsUSDC shares at 1:1, and redeem shares for test USDC. The web panel reads the connected wallet balance, allowance and redeemable shares, and links to submitted transactions.
- The pilot keeps USDC in custody. It earns no yield and has no integration with the Uniswap positions or Reactive callbacks. Direct transfers to the vault issue no shares and cannot be reclaimed through the contract.
- **Deployed 2026-11-18** on Base Sepolia at 0x58E05155d38F747292929Fd25D242d282A319c29 (tx 0xfc1af50bceb537ecbec2c1552e29a625cffcfa2d5cfa4216e355c3762221d385, block 60401385). Record: deployments/84532-usdc-vault.json. The frontend still needs NEXT_PUBLIC_BASE_SEPOLIA_USDC_VAULT set to that address (in web/.env.local) before it enables transactions.

## Run the pilot

1. Set the existing testnet-only deployer credentials and Base Sepolia RPC using .env.example as a reference.
2. Run forge test --match-contract RespoolUSDCVaultTest.
3. Simulate with forge script script/DeployUSDCVault.s.sol --rpc-url base_sepolia. Add --broadcast to deploy using the funded testnet account.
4. In web/.env.local set NEXT_PUBLIC_BASE_SEPOLIA_USDC_VAULT to the deployed RespoolUSDCVault address. Restart the dev server or rebuild for production.
5. Run npm run dev from web and click Open app. Connect a wallet on Base Sepolia with test ETH and Circle test USDC. Approve, deposit a small amount, refresh, and withdraw. Check both wallet balances and the transaction receipts.

Circle test USDC on Base Sepolia is 0x036CbD53842c5426634e7929541eC2318f3dCF7e. See https://developers.circle.com/stablecoins/usdc-contract-addresses.

## Remaining work

1. Build and test a single-chain managed Uniswap v4 strategy. Design share valuation, slippage bounds, fee accounting, and redemptions that unwind the strategy. The custody pilot's fixed 1:1 share accounting only applies while assets are held as cash.
2. Add an onchain deployment record and run the wallet flow against the deployed vault.
3. Add CCTP for the cross-chain USDC leg. Account for pending transfers, retries and withdrawals during transit. Measure its settlement independently from the existing custom test-token demo.

## Verification

- Frontend type check passed with npm --prefix web run typecheck.
- The focused Foundry vault test passed. It covers deposit, partial redemption, excess redemption rejection, and share accounting after a direct token transfer.
- Deployed and checked on chain: asset() is Circle's Base Sepolia USDC, name/symbol/decimals are correct, totalSupply is 0, and simulated deposit-without-allowance, deposit(0) and redeem-without-shares all revert. A real browser-wallet deposit and withdrawal are still unverified (the deployer wallet holds no test USDC; Circle's faucet needs a browser).

## RainbowKit integration verification

- Installed @rainbow-me/rainbowkit, wagmi, viem and @tanstack/react-query through npm, with package-lock.json updated.
- Added @x402/core, @x402/evm and @x402/svm because the wallet bundle's Coinbase dependency imports these optional peers during Next.js compilation.
- Replaced the custom picker with RainbowKit ConnectButton and app-scoped providers. Browser extension discovery works without a WalletConnect project ID. Mobile pairing requires NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID.
- Type check passed after installation. The local /app route returned HTTP 200 and RainbowKit markup.
- A real extension approval and mobile QR pairing remain unverified.
