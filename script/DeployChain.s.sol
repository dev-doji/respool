// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {console} from "forge-std/console.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

import {RespoolToken} from "../src/RespoolToken.sol";
import {RespoolVault} from "../src/RespoolVault.sol";
import {RespoolConfig} from "./RespoolConfig.sol";

/// @notice Step 2, on Unichain Sepolia and on Base Sepolia: deploy the two test tokens, create the Respool
///         v4 pool at 1:1, deploy the vault (bound to BRAIN), fund it with ETH for callbacks, and give the
///         deployer demo balances for swaps.
/// BRAIN=0x... forge script script/DeployChain.s.sol --rpc-url unichain_sepolia --broadcast
contract DeployChain is RespoolConfig {
    using PoolIdLibrary for PoolKey;

    function run() external returns (RespoolVault vault) {
        ChainAddrs memory a = chainAddrs(block.chainid);
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address brain = vm.envAddress("BRAIN");
        uint256 fund = vm.envOr("VAULT_FUND_WEI", uint256(0.01 ether));
        address me = vm.addr(pk);

        vm.startBroadcast(pk);
        RespoolToken x = new RespoolToken("Respool Test USD", "rUSD");
        RespoolToken y = new RespoolToken("Respool Test ETH", "rETH");
        (RespoolToken t0, RespoolToken t1) = address(x) < address(y) ? (x, y) : (y, x);
        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(t0)),
            currency1: Currency.wrap(address(t1)),
            fee: FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(0))
        });
        IPoolManager(a.poolManager).initialize(key, SQRT_PRICE_1_1);

        vault = new RespoolVault{value: fund}(
            IPayable(payable(a.callbackProxy)), brain, IPoolManager(a.poolManager), key, HALF_WIDTH
        );
        t0.setMinter(address(vault), true);
        t1.setMinter(address(vault), true);
        t0.setMinter(me, true);
        t1.setMinter(me, true);
        t0.mint(me, 10_000 ether);
        t1.mint(me, 10_000 ether);
        t0.approve(a.swapRouter, type(uint256).max);
        t1.approve(a.swapRouter, type(uint256).max);
        vm.stopBroadcast();

        string memory k = "chain";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "brain", brain);
        vm.serializeAddress(k, "vault", address(vault));
        vm.serializeAddress(k, "token0", address(t0));
        vm.serializeAddress(k, "token1", address(t1));
        vm.serializeAddress(k, "poolManager", a.poolManager);
        vm.serializeAddress(k, "swapRouter", a.swapRouter);
        string memory json = vm.serializeBytes32(k, "poolId", PoolId.unwrap(key.toId()));
        vm.writeJson(json, deployFile(block.chainid));

        console.log("RespoolVault:", address(vault));
        console.log("token0:", address(t0));
        console.log("token1:", address(t1));
        console.logBytes32(PoolId.unwrap(key.toId()));
    }
}
