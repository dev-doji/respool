// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {console} from "forge-std/console.sol";
import {RespoolVault} from "../src/RespoolVault.sol";
import {RespoolConfig} from "./RespoolConfig.sol";

/// @notice Step 4, on each chain, after ConfigureBrain: seed the vault with test tokens and open its first
///         position. The brain learns the opening range from the vault's Recentred event.
/// forge script script/Bootstrap.s.sol --rpc-url unichain_sepolia --broadcast
contract Bootstrap is RespoolConfig {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        uint256 amount = vm.envOr("SEED_WEI", uint256(100 ether));
        RespoolVault vault =
            RespoolVault(payable(vm.parseJsonAddress(vm.readFile(deployFile(block.chainid)), ".vault")));

        vm.startBroadcast(pk);
        vault.bootstrap(amount, amount);
        vm.stopBroadcast();

        console.log("liquidity:", vault.liquidity());
        console.log("range lower/upper:");
        console.logInt(vault.tickLower());
        console.logInt(vault.tickUpper());
    }
}
