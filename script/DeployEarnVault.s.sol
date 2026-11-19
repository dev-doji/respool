// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script, console} from "forge-std/Script.sol";
import {ERC20} from "../lib/v4-core/lib/solmate/src/tokens/ERC20.sol";
import {RespoolEarnVault} from "../src/RespoolEarnVault.sol";
import {RespoolRewardToken} from "../src/RespoolRewardToken.sol";

/// @notice Deploys the earning vault and its test reward token on Base Sepolia or Unichain Sepolia, then funds the
///         reward stream. Rewards are a test token minted by the deployer, not trading fees.
/// forge script script/DeployEarnVault.s.sol --rpc-url base_sepolia --broadcast
/// forge script script/DeployEarnVault.s.sol --rpc-url unichain_sepolia --broadcast
/// Optional env: REWARD_TOTAL (whole tokens, default 30000), REWARD_DAYS (default 30).
contract DeployEarnVault is Script {
    // Circle's test USDC (checked on chain).
    address internal constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address internal constant UNICHAIN_SEPOLIA_USDC = 0x31d0220469e10c4E71834a79b1f276d740d3768F;

    function run() external returns (RespoolEarnVault vault, RespoolRewardToken reward) {
        address usdc;
        if (block.chainid == 84532) usdc = BASE_SEPOLIA_USDC;
        else if (block.chainid == 1301) usdc = UNICHAIN_SEPOLIA_USDC;
        else revert("run on Base Sepolia (84532) or Unichain Sepolia (1301)");

        uint256 total = vm.envOr("REWARD_TOTAL", uint256(30_000)) * 1e18;
        uint256 duration = vm.envOr("REWARD_DAYS", uint256(30)) * 1 days;

        uint256 key = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(key);
        vm.startBroadcast(key);
        reward = new RespoolRewardToken();
        vault = new RespoolEarnVault(ERC20(usdc), reward);
        reward.mint(deployer, total);
        reward.approve(address(vault), total);
        vault.notifyReward(total, duration);
        vm.stopBroadcast();

        console.log("RespoolRewardToken", address(reward));
        console.log("RespoolEarnVault  ", address(vault));
        vm.writeFile(
            string.concat("deployments/", vm.toString(block.chainid), "-earn-vault.json"),
            string.concat(
                '{"chainId":', vm.toString(block.chainid), ',"vault":"', vm.toString(address(vault)),
                '","rewardToken":"', vm.toString(address(reward)), '","asset":"', vm.toString(usdc),
                '","rewardTotal":"', vm.toString(total), '","rewardSeconds":', vm.toString(duration), "}\n"
            )
        );
    }
}
