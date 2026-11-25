// The chains the test-USDC vault runs on. Vault addresses come from NEXT_PUBLIC_* env vars. Each must be written
// out in full (process.env.NEXT_PUBLIC_X) so Next.js can inline it into the browser bundle.
const address = (value: string | undefined): string => (value && /^0x[\da-f]{40}$/i.test(value) ? value : "");

export interface UsdcNetwork {
  id: number;
  name: string;
  /** Circle's test USDC on this chain. */
  usdc: string;
  /** RespoolUSDCVault on this chain, or "" when it has not been deployed or configured. */
  vault: string;
  explorer: string;
  ethFaucet: string;
  /** Public RPC, used to check receipts independently of the wallet's own node. */
  rpc: string;
  /** How many recent blocks one eth_getLogs call may cover on this chain's public RPC (Base allows 200, Unichain 1,000). */
  logWindow: number;
}

export const NETWORKS: UsdcNetwork[] = [
  {
    id: 84532,
    name: "Base Sepolia",
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    vault: address(process.env.NEXT_PUBLIC_BASE_SEPOLIA_USDC_VAULT),
    explorer: "https://sepolia.basescan.org",
    rpc: "https://sepolia.base.org",
    logWindow: 190,
    ethFaucet: "https://console.optimism.io/faucet",
  },
  {
    id: 1301,
    name: "Unichain Sepolia",
    usdc: "0x31d0220469e10c4E71834a79b1f276d740d3768F",
    vault: address(process.env.NEXT_PUBLIC_UNICHAIN_SEPOLIA_USDC_VAULT),
    explorer: "https://sepolia.uniscan.xyz",
    rpc: "https://sepolia.unichain.org",
    logWindow: 900,
    ethFaucet: "https://www.alchemy.com/faucets/unichain-sepolia",
  },
  {
    id: 11155111,
    name: "Ethereum Sepolia",
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    vault: address(process.env.NEXT_PUBLIC_ETHEREUM_SEPOLIA_USDC_VAULT),
    explorer: "https://sepolia.etherscan.io",
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    logWindow: 9000,
    ethFaucet: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
  },
];

export const networkById = (id: number | undefined): UsdcNetwork | undefined => NETWORKS.find((n) => n.id === id);
