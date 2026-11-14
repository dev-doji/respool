// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script} from "forge-std/Script.sol";
import {RespoolBrain} from "../src/RespoolBrain.sol";

/// @notice Addresses and defaults shared by the deploy scripts.
/// @dev Every address below was checked on 2026-11-13 against the official docs and on chain
///      (code present; each PoolSwapTest's manager() returns that chain's PoolManager).
abstract contract RespoolConfig is Script {
    uint256 internal constant LASNA = 5318007;
    uint256 internal constant UNICHAIN_SEPOLIA = 1301;
    uint256 internal constant BASE_SEPOLIA = 84532;

    uint160 internal constant SQRT_PRICE_1_1 = 79228162514264337593543950336;
    int24 internal constant TICK_SPACING = 60;
    uint24 internal constant FEE = 3000;
    int24 internal constant HALF_WIDTH = 2; // position spans 5 tick spacings (about +-1.5%)

    struct ChainAddrs {
        address poolManager;
        address swapRouter; // Uniswap's PoolSwapTest router
        address callbackProxy; // Reactive callback proxy
    }

    function chainAddrs(uint256 chainId) internal pure returns (ChainAddrs memory) {
        if (chainId == UNICHAIN_SEPOLIA) {
            return ChainAddrs({
                poolManager: 0x00B036B58a818B1BC34d502D3fE730Db729e62AC,
                swapRouter: 0x9140a78c1A137c7fF1c151EC8231272aF78a99A4,
                callbackProxy: 0x775c9B990ADe401060B78D0e98684eEf8d2466C1
            });
        }
        if (chainId == BASE_SEPOLIA) {
            return ChainAddrs({
                poolManager: 0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408,
                swapRouter: 0x8B5bcC363ddE2614281aD875bad385E0A785D3B9,
                callbackProxy: 0x476F44b11F5C942c58f4c8E3d0300E5710743585
            });
        }
        revert("RespoolConfig: unsupported chain");
    }

    function brainParams() internal pure returns (RespoolBrain.Params memory) {
        return RespoolBrain.Params({
            demandHalfLifeBlocks: 60, // demand halves after about a minute without swaps
            ratioBps: 30_000, // busy chain needs 3x the quiet chain's demand (balanced trading sits near 1.3x)
            minHotDemand: 1 ether,
            cooldownBlocks: 30, // about 30 s on Lasna
            pendingTimeoutBlocks: 60,
            shareBps: 5_000, // move half of the quiet chain's position
            recentreGas: 1_500_000,
            departGas: 1_000_000,
            arriveGas: 1_500_000
        });
    }

    function deployDir() internal view returns (string memory) {
        return vm.envOr("DEPLOY_DIR", string("deployments"));
    }

    function deployFile(uint256 chainId) internal view returns (string memory) {
        return string.concat(deployDir(), "/", vm.toString(chainId), ".json");
    }
}
