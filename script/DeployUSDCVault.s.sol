// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script, console} from "forge-std/Script.sol";
import {ERC20, RespoolUSDCVault} from "../src/RespoolUSDCVault.sol";

/// @notice Deploys the test-USDC custody vault on Base Sepolia or Unichain Sepolia.
/// forge script script/DeployUSDCVault.s.sol --rpc-url base_sepolia --broadcast
/// forge script script/DeployUSDCVault.s.sol --rpc-url unichain_sepolia --broadcast
contract DeployUSDCVault is Script {
    // Circle's test USDC, from developers.circle.com/stablecoins/usdc-contract-addresses (checked on chain).
    address internal constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address internal constant UNICHAIN_SEPOLIA_USDC = 0x31d0220469e10c4E71834a79b1f276d740d3768F;

    function run() external returns (RespoolUSDCVault vault) {
        address usdc;
        string memory envName;
        if (block.chainid == 84532) {
            usdc = BASE_SEPOLIA_USDC;
            envName = "NEXT_PUBLIC_BASE_SEPOLIA_USDC_VAULT";
        } else if (block.chainid == 1301) {
            usdc = UNICHAIN_SEPOLIA_USDC;
            envName = "NEXT_PUBLIC_UNICHAIN_SEPOLIA_USDC_VAULT";
        } else {
            revert("run on Base Sepolia (84532) or Unichain Sepolia (1301)");
        }
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        vault = new RespoolUSDCVault(ERC20(usdc));
        vm.stopBroadcast();
        console.log("Set", envName, "to", address(vault));
    }
}
