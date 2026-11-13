// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {console} from "forge-std/console.sol";
import {RespoolBrain} from "../src/RespoolBrain.sol";
import {RespoolConfig} from "./RespoolConfig.sol";

/// @notice Step 3, on Reactive Lasna: register each deployed chain with the brain (this subscribes it to
///         that chain's pool and vault events). Reads deployments/<chainId>.json written by DeployChain.
/// forge script script/ConfigureBrain.s.sol --rpc-url lasna --broadcast
contract ConfigureBrain is RespoolConfig {
    function run() external {
        require(block.chainid == LASNA, "run on Lasna");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        RespoolBrain brain =
            RespoolBrain(payable(vm.parseJsonAddress(vm.readFile(deployFile(LASNA)), ".brain")));

        uint256[2] memory ids = [UNICHAIN_SEPOLIA, BASE_SEPOLIA];
        vm.startBroadcast(pk);
        for (uint256 i = 0; i < ids.length; i++) {
            string memory path = deployFile(ids[i]);
            if (!vm.exists(path)) {
                console.log("skip (not deployed):", ids[i]);
                continue;
            }
            string memory json = vm.readFile(path);
            require(vm.parseJsonAddress(json, ".brain") == address(brain), "vault bound to a different brain");
            // Re-running configureChain would subscribe the same filters twice, so skip chains already set.
            (,, address current,,,,,,,,,) = brain.chains(ids[i]);
            if (current == vm.parseJsonAddress(json, ".vault")) {
                console.log("skip (already configured):", ids[i]);
                continue;
            }
            brain.configureChain(
                ids[i],
                vm.parseJsonAddress(json, ".poolManager"),
                vm.parseJsonBytes32(json, ".poolId"),
                vm.parseJsonAddress(json, ".vault")
            );
            console.log("configured chain", ids[i]);
        }
        vm.stopBroadcast();
    }
}
