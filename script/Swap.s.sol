// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {console} from "forge-std/console.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";

import {RespoolConfig} from "./RespoolConfig.sol";

/// @notice Demo trader: one exact-input swap in the Respool pool, to trigger the brain.
///         SWAP_WEI (default 1 ether), ZERO_FOR_ONE (default true), and the price stops at most
///         LIMIT_TICKS (default 600) ticks from where it started.
/// forge script script/Swap.s.sol --rpc-url unichain_sepolia --broadcast
contract Swap is RespoolConfig {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        uint256 amount = vm.envOr("SWAP_WEI", uint256(1 ether));
        bool zeroForOne = vm.envOr("ZERO_FOR_ONE", true);
        int24 limitTicks = int24(vm.envOr("LIMIT_TICKS", int256(600)));

        string memory json = vm.readFile(deployFile(block.chainid));
        IPoolManager pm = IPoolManager(vm.parseJsonAddress(json, ".poolManager"));
        PoolSwapTest router = PoolSwapTest(vm.parseJsonAddress(json, ".swapRouter"));
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(vm.parseJsonAddress(json, ".token0")),
            currency1: Currency.wrap(vm.parseJsonAddress(json, ".token1")),
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(0))
        });

        (, int24 tickBefore,,) = pm.getSlot0(key.toId());
        int24 limit = zeroForOne ? tickBefore - limitTicks : tickBefore + limitTicks;

        vm.startBroadcast(pk);
        router.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(amount),
                sqrtPriceLimitX96: TickMath.getSqrtPriceAtTick(limit)
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
        vm.stopBroadcast();

        (, int24 tickAfter,,) = pm.getSlot0(key.toId());
        console.log("tick before / after:");
        console.logInt(tickBefore);
        console.logInt(tickAfter);
    }
}
