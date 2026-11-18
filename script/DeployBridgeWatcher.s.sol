// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {console} from "forge-std/console.sol";
import {RespoolBridgeWatcher} from "../src/RespoolBridgeWatcher.sol";
import {RespoolConfig} from "./RespoolConfig.sol";

/// @notice On Reactive Lasna: deploy RespoolBridgeWatcher, fund it, and watch Across on Unichain Sepolia and Base Sepolia
///         in both directions.
/// forge script script/DeployBridgeWatcher.s.sol --rpc-url lasna --broadcast
contract DeployBridgeWatcher is RespoolConfig {
    address constant SPOKE_UNICHAIN = 0x6999526e507Cc3b03b180BbE05E1Ff938259A874;
    address constant SPOKE_BASE = 0x82B564983aE7274c86695917BBf8C99ECb6F0F8F;
    uint256 constant UNICHAIN_ID = 1301;
    uint256 constant BASE_ID = 84532;

    function run() external returns (RespoolBridgeWatcher w) {
        require(block.chainid == LASNA, "run on Lasna");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        uint256 fund = vm.envOr("WATCHER_FUND_WEI", uint256(3 ether));

        vm.startBroadcast(pk);
        w = new RespoolBridgeWatcher{value: fund}();
        w.watchDeposits(UNICHAIN_ID, SPOKE_UNICHAIN);
        w.watchFills(UNICHAIN_ID, SPOKE_UNICHAIN);
        w.watchDeposits(BASE_ID, SPOKE_BASE);
        w.watchFills(BASE_ID, SPOKE_BASE);
        vm.stopBroadcast();

        string memory k = "watcher";
        vm.serializeUint(k, "chainId", block.chainid);
        string memory json = vm.serializeAddress(k, "watcher", address(w));
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), "-bridge-watcher.json"));
        console.log("RespoolBridgeWatcher:", address(w));
    }
}
