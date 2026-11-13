// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test, Vm} from "forge-std/Test.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";

import {RespoolBrain} from "../src/RespoolBrain.sol";
import {RespoolToken} from "../src/RespoolToken.sol";
import {RespoolVault} from "../src/RespoolVault.sol";
import {RespoolPolicy} from "../src/RespoolPolicy.sol";
import {MockSystem} from "./utils/MockSystem.sol";

/// @notice SIMULATED end-to-end loop. One local chain plays both "Unichain" (1301) and "Base" (84532):
///         two pools on one PoolManager, a vault for each, and the real RespoolBrain. A relay in the test
///         does Reactive Network's job: it feeds recorded logs to `brain.react()` as the system contract,
///         then delivers requested callbacks as the callback proxy, injecting the brain's address into the
///         first argument exactly as the network does. No timing is measured here.
contract RespoolLoopTest is Test {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    address constant SYS = 0x8888888888888888888888888888888888888888;
    address constant PROXY = address(0xBEEF);
    uint256 constant U = 1301;
    uint256 constant B = 84532;
    uint160 constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    MockSystem sys;
    RespoolBrain brain;
    IPoolManager pm;
    PoolSwapTest router;

    struct Side {
        RespoolToken t0;
        RespoolToken t1;
        PoolKey key;
        RespoolVault vault;
    }

    Side u;
    Side b;
    bytes32 swapTopic = IPoolManager.Swap.selector;

    function setUp() public {
        vm.etch(SYS, address(new MockSystem()).code);
        sys = MockSystem(payable(SYS));
        pm = IPoolManager(deployCode("PoolManager.sol:PoolManager", abi.encode(address(this))));
        router = new PoolSwapTest(pm);

        brain = new RespoolBrain(
            RespoolBrain.Params({
                alphaBps: 5_000,
                ratioBps: 20_000,
                minHotDemand: 1 ether,
                cooldownBlocks: 0,
                pendingTimeoutBlocks: 100,
                shareBps: 5_000,
                recentreGas: 2_000_000,
                departGas: 2_000_000,
                arriveGas: 2_000_000
            })
        );
        u = _side("U");
        b = _side("B");
        brain.configureChain(U, address(pm), PoolId.unwrap(u.key.toId()), address(u.vault));
        brain.configureChain(B, address(pm), PoolId.unwrap(b.key.toId()), address(b.vault));

        vm.recordLogs();
        u.vault.bootstrap(100 ether, 100 ether);
        b.vault.bootstrap(100 ether, 100 ether);
        _pump();
    }

    function _side(string memory tag) internal returns (Side memory s) {
        RespoolToken x = new RespoolToken(string.concat("Respool USD ", tag), "rUSD");
        RespoolToken y = new RespoolToken(string.concat("Respool ETH ", tag), "rETH");
        (s.t0, s.t1) = address(x) < address(y) ? (x, y) : (y, x);
        s.key = PoolKey({
            currency0: Currency.wrap(address(s.t0)),
            currency1: Currency.wrap(address(s.t1)),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });
        pm.initialize(s.key, SQRT_PRICE_1_1);
        s.vault = new RespoolVault(IPayable(payable(PROXY)), address(brain), pm, s.key, 2);
        s.t0.setMinter(address(s.vault), true);
        s.t1.setMinter(address(s.vault), true);
        s.t0.setMinter(address(this), true);
        s.t1.setMinter(address(this), true);
        s.t0.mint(address(this), 1_000 ether);
        s.t1.mint(address(this), 1_000 ether);
        s.t0.approve(address(router), type(uint256).max);
        s.t1.approve(address(router), type(uint256).max);
    }

    // ------------------------------------------------------------------ the relay (simulated Reactive Network)

    function _chainOf(Vm.Log memory l) internal view returns (uint256) {
        if (l.emitter == address(u.vault)) return U;
        if (l.emitter == address(b.vault)) return B;
        if (l.emitter == address(pm) && l.topics.length > 1 && l.topics[0] == swapTopic) {
            if (l.topics[1] == PoolId.unwrap(u.key.toId())) return U;
            if (l.topics[1] == PoolId.unwrap(b.key.toId())) return B;
        }
        return 0;
    }

    function _topic(Vm.Log memory l, uint256 i) internal pure returns (uint256) {
        return i < l.topics.length ? uint256(l.topics[i]) : 0;
    }

    /// Deliver logs to the brain and callbacks to the vaults until nothing is left to do.
    function _pump() internal {
        for (uint256 round = 0; round < 20; round++) {
            Vm.Log[] memory logs = vm.getRecordedLogs();
            for (uint256 i = 0; i < logs.length; i++) {
                uint256 chainId = _chainOf(logs[i]);
                if (chainId == 0) continue;
                IReactive.LogRecord memory r = IReactive.LogRecord({
                    chainId: chainId,
                    contractAddress: logs[i].emitter,
                    topic0: _topic(logs[i], 0),
                    topic1: _topic(logs[i], 1),
                    topic2: _topic(logs[i], 2),
                    topic3: _topic(logs[i], 3),
                    data: logs[i].data,
                    blockNumber: block.number,
                    opCode: logs[i].topics.length,
                    blockHash: 0,
                    txHash: uint256(keccak256(abi.encode(round, i))),
                    logIndex: i
                });
                vm.prank(SYS);
                brain.react(r);
            }
            // No callbacks requested: the only new logs are the brain's own events, so the loop has settled.
            if (sys.pending() == 0) return;
            while (sys.pending() > 0) {
                ISystemContract.CallbackConfiguration_V_1_0 memory cb = sys.markDelivered();
                bytes memory payload = cb.payload;
                address rvm = address(brain);
                assembly {
                    mstore(add(payload, 36), rvm) // overwrite the first argument, as the network does
                }
                vm.prank(PROXY);
                (bool ok,) = cb.recipient.call{gas: cb.gasLimit}(payload);
                assertTrue(ok, "callback reverted");
            }
        }
        revert("relay did not settle");
    }

    function _swap(Side memory s, int256 amountIn, int24 limitTick) internal {
        router.swap(
            s.key,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -amountIn,
                sqrtPriceLimitX96: TickMath.getSqrtPriceAtTick(limitTick)
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    function _tick(Side memory s) internal view returns (int24 tick) {
        (, tick,,) = pm.getSlot0(s.key.toId());
    }

    // ------------------------------------------------------------------ loops

    function test_loop_brainLearnsBootstrapRanges() public view {
        (,,,, int24 lo, int24 hi, uint128 liq, bool hasRange,,,,) = brain.chains(U);
        assertTrue(hasRange);
        assertEq(lo, u.vault.tickLower());
        assertEq(hi, u.vault.tickUpper());
        assertEq(liq, u.vault.totalLiquidity());
    }

    /// Price leaves the range on "Unichain"; the brain asks the vault to recentre; the vault does.
    function test_loop_recentreFollowsPrice() public {
        RespoolBrain.Params memory p;
        (p.alphaBps, p.ratioBps,, p.cooldownBlocks, p.pendingTimeoutBlocks, p.shareBps,,,) = brain.params();
        p.minHotDemand = type(uint256).max; // isolate the recentre rule
        p.recentreGas = 2_000_000;
        p.departGas = 2_000_000;
        p.arriveGas = 2_000_000;
        brain.setParams(p);

        _swap(u, 500 ether, -600);
        int24 tick = _tick(u);
        assertTrue(RespoolPolicy.outOfRange(tick, u.vault.tickLower(), u.vault.tickUpper()));

        _pump();

        assertFalse(RespoolPolicy.outOfRange(tick, u.vault.tickLower(), u.vault.tickUpper()));
        assertEq(u.vault.lastRecentreSeq(), 1);
        (,,,, int24 lo, int24 hi,,,,, bool pending,) = brain.chains(U);
        assertEq(lo, u.vault.tickLower());
        assertEq(hi, u.vault.tickUpper());
        assertFalse(pending);
    }

    /// Trading picks up on "Unichain" only; half of "Base"'s position departs and arrives on "Unichain".
    function test_loop_liquidityMovesToBusyChain() public {
        uint128 uBefore = u.vault.liquidity();
        uint128 bBefore = b.vault.liquidity();
        uint256 total0 = u.t0.totalSupply() + b.t0.totalSupply();
        uint256 total1 = u.t1.totalSupply() + b.t1.totalSupply();

        _swap(u, 4 ether, -600); // in range, but enough flow to make Unichain "hot"
        _pump();

        assertEq(brain.lastMoveId(), 1);
        assertEq(brain.inFlightMove(), 0, "move should complete");
        assertTrue(b.vault.departed(1));
        assertTrue(u.vault.arrived(1));
        assertApproxEqAbs(b.vault.liquidity(), bBefore / 2, 1);
        assertGt(u.vault.liquidity(), uBefore);
        // Test-token supply across both chains is conserved by the move.
        assertEq(u.t0.totalSupply() + b.t0.totalSupply(), total0);
        assertEq(u.t1.totalSupply() + b.t1.totalSupply(), total1);
    }
}
