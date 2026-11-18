// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script, console} from "forge-std/Script.sol";
import {ERC20, RespoolUSDCVault} from "../src/RespoolUSDCVault.sol";

contract DeployUSDCVault is Script {
    address internal constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external returns (RespoolUSDCVault vault) {
        require(block.chainid == 84532, "run on Base Sepolia");
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        vault = new RespoolUSDCVault(ERC20(BASE_SEPOLIA_USDC));
        vm.stopBroadcast();
        console.log("Set NEXT_PUBLIC_BASE_SEPOLIA_USDC_VAULT to", address(vault));
    }
}
