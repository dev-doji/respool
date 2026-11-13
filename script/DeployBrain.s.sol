// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {console} from "forge-std/console.sol";
import {RespoolBrain} from "../src/RespoolBrain.sol";
import {RespoolConfig} from "./RespoolConfig.sol";

/// @notice Step 1, on Reactive Lasna: deploy RespoolBrain and fund it with lREACT for its reactive txs.
/// forge script script/DeployBrain.s.sol --rpc-url lasna --broadcast
contract DeployBrain is RespoolConfig {
    function run() external returns (RespoolBrain brain) {
        require(block.chainid == LASNA, "run on Lasna");
        uint256 pk = vm.envUint("PRIVATE_KEY");
        uint256 fund = vm.envOr("BRAIN_FUND_WEI", uint256(5 ether));

        vm.startBroadcast(pk);
        brain = new RespoolBrain{value: fund}(brainParams());
        vm.stopBroadcast();

        string memory k = "brain";
        vm.serializeUint(k, "chainId", block.chainid);
        string memory json = vm.serializeAddress(k, "brain", address(brain));
        vm.writeJson(json, deployFile(LASNA));
        console.log("RespoolBrain:", address(brain));
        console.log("Next: BRAIN=%s, run DeployChain on Unichain Sepolia and Base Sepolia", address(brain));
    }
}
