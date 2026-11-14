// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";
import {AbstractPayer} from "@reactive/src/base/AbstractPayer.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

import {RespoolBrain} from "../src/RespoolBrain.sol";
import {RespoolVault} from "../src/RespoolVault.sol";
import {MockSystem} from "./utils/MockSystem.sol";

/// @dev Unit tests for the brain's rules. Logs are hand-built; callbacks are only recorded, not executed.
contract RespoolBrainTest is Test {
    address constant SYS = 0x8888888888888888888888888888888888888888;
    uint256 constant U = 1301; // Unichain Sepolia
    uint256 constant B = 84532; // Base Sepolia
    address constant PM_U = address(0x1001);
    address constant PM_B = address(0x1002);
    address constant VAULT_U = address(0x2001);
    address constant VAULT_B = address(0x2002);
    bytes32 constant POOL_U = keccak256("pool-u");
    bytes32 constant POOL_B = keccak256("pool-b");

    uint256 immutable SWAP = uint256(IPoolManager.Swap.selector);
    uint256 immutable RECENTRED = uint256(RespoolVault.Recentred.selector);
    uint256 immutable DEPARTED = uint256(RespoolVault.Departed.selector);
    uint256 immutable ARRIVED = uint256(RespoolVault.Arrived.selector);
    uint256 immutable SKIPPED = uint256(RespoolVault.CallbackSkipped.selector);

    MockSystem sys;
    RespoolBrain brain;
    uint256 nonce;

    function setUp() public {
        vm.etch(SYS, address(new MockSystem()).code);
        sys = MockSystem(payable(SYS));
        brain = new RespoolBrain(_params());
        brain.configureChain(U, PM_U, POOL_U, VAULT_U);
        brain.configureChain(B, PM_B, POOL_B, VAULT_B);
    }

    function _params() internal pure returns (RespoolBrain.Params memory) {
        return RespoolBrain.Params({
            demandHalfLifeBlocks: 60,
            ratioBps: 30_000,
            minHotDemand: 1 ether,
            cooldownBlocks: 0,
            pendingTimeoutBlocks: 100,
            shareBps: 5_000,
            recentreGas: 1_000_000,
            departGas: 1_000_000,
            arriveGas: 1_000_000
        });
    }

    // ------------------------------------------------------------------ log builders

    function _rec(uint256 chainId, address emitter, uint256 t0, uint256 t1, bytes memory data)
        internal
        returns (IReactive.LogRecord memory r)
    {
        r = IReactive.LogRecord({
            chainId: chainId,
            contractAddress: emitter,
            topic0: t0,
            topic1: t1,
            topic2: 0,
            topic3: 0,
            data: data,
            blockNumber: 1,
            opCode: 3,
            blockHash: 0,
            txHash: uint256(keccak256(abi.encode(++nonce))),
            logIndex: 0
        });
    }

    function _react(IReactive.LogRecord memory r) internal {
        vm.prank(SYS);
        brain.react(r);
    }

    function _swap(uint256 chainId, int128 amount0, int24 tick) internal returns (bytes32 trigger) {
        (address pm, bytes32 pool) = chainId == U ? (PM_U, POOL_U) : (PM_B, POOL_B);
        IReactive.LogRecord memory r = _rec(
            chainId,
            pm,
            SWAP,
            uint256(pool),
            abi.encode(amount0, -amount0, uint160(1), uint128(1), tick, uint24(3000))
        );
        _react(r);
        return bytes32(r.txHash);
    }

    function _recentred(uint256 chainId, uint64 seq, int24 lo, int24 hi, uint128 liq) internal {
        address v = chainId == U ? VAULT_U : VAULT_B;
        _react(_rec(chainId, v, RECENTRED, seq, abi.encode(int24(0), lo, hi, liq, bytes32(0))));
    }

    function _departed(uint256 chainId, uint64 moveId, uint256 a0, uint256 a1) internal returns (bytes32) {
        address v = chainId == U ? VAULT_U : VAULT_B;
        IReactive.LogRecord memory r = _rec(
            chainId,
            v,
            DEPARTED,
            moveId,
            abi.encode(uint256(0), a0, a1, int24(-120), int24(180), uint128(500), bytes32(0))
        );
        _react(r);
        return bytes32(r.txHash);
    }

    function _arrived(uint256 chainId, uint64 moveId) internal {
        address v = chainId == U ? VAULT_U : VAULT_B;
        _react(
            _rec(
                chainId,
                v,
                ARRIVED,
                moveId,
                abi.encode(uint256(1), uint256(1), int24(-120), int24(180), uint128(1500), bytes32(0))
            )
        );
    }

    function _bootstrapBoth() internal {
        _recentred(U, 0, -120, 180, 1000);
        _recentred(B, 0, -120, 180, 1000);
    }

    function _noMoves() internal {
        RespoolBrain.Params memory p = _params();
        p.ratioBps = type(uint32).max;
        p.minHotDemand = type(uint256).max;
        brain.setParams(p);
    }

    // ------------------------------------------------------------------ setup / auth

    function test_configure_subscribesFiveFiltersPerChain() public view {
        assertEq(sys.subCount(), 10);
        MockSystem.Sub memory s = sys.sub(0);
        assertEq(s.subscriber, address(brain));
        assertEq(s.chainId, U);
        assertEq(s.contract_, PM_U);
        assertEq(s.topic0, SWAP);
        assertEq(s.topic1, uint256(POOL_U));
        MockSystem.Sub memory d = sys.sub(7);
        assertEq(d.chainId, B);
        assertEq(d.contract_, VAULT_B);
        assertEq(d.topic0, DEPARTED);
    }

    function test_configure_onlyOwner() public {
        vm.prank(address(0xCAFE));
        vm.expectRevert(RespoolBrain.NotOwner.selector);
        brain.configureChain(1, PM_U, POOL_U, VAULT_U);
    }

    function test_configure_atMostTwoChains() public {
        vm.expectRevert(RespoolBrain.TooManyChains.selector);
        brain.configureChain(11155111, PM_U, POOL_U, VAULT_U);
    }

    function test_react_onlySystem() public {
        IReactive.LogRecord memory r = _rec(U, PM_U, SWAP, uint256(POOL_U), "");
        vm.expectRevert(abi.encodeWithSelector(AbstractPayer.NotAuthorized.selector, address(this), SYS));
        brain.react(r);
    }

    // ------------------------------------------------------------------ recentre rule

    function test_swapInRange_requestsNothing() public {
        _bootstrapBoth();
        _noMoves();
        _swap(U, 1 ether, 60);
        assertEq(sys.callbackCount(), 0);
    }

    function test_swapOutOfRange_requestsRecentreOnceUntilVaultReports() public {
        _bootstrapBoth();
        _noMoves();

        bytes32 trigger = _swap(U, 1 ether, 500);
        assertEq(sys.callbackCount(), 1);
        ISystemContract.CallbackConfiguration_V_1_0 memory cb = sys.callback(0);
        assertEq(cb.chainId, U);
        assertEq(cb.recipient, VAULT_U);
        assertEq(
            cb.payload, abi.encodeCall(RespoolVault.recentre, (address(0), uint64(1), int24(500), trigger))
        );

        _swap(U, 1 ether, 600); // still pending: no second request
        assertEq(sys.callbackCount(), 1);

        _recentred(U, 1, 420, 720, 900);
        bytes32 trigger2 = _swap(U, 1 ether, 900); // out of the new range
        assertEq(sys.callbackCount(), 2);
        assertEq(
            sys.callback(1).payload,
            abi.encodeCall(RespoolVault.recentre, (address(0), uint64(2), int24(900), trigger2))
        );
    }

    function test_skippedInRange_clearsPending() public {
        _bootstrapBoth();
        _noMoves();
        _swap(U, 1 ether, 500);
        _react(_rec(U, VAULT_U, SKIPPED, 1, abi.encode(uint8(2), bytes32(0))));
        _swap(U, 1 ether, 500);
        assertEq(sys.callbackCount(), 2);
    }

    function test_pendingRecentre_retriesAfterTimeout() public {
        _bootstrapBoth();
        _noMoves();
        _swap(U, 1 ether, 500);
        vm.roll(block.number + 100);
        _swap(U, 1 ether, 500);
        assertEq(sys.callbackCount(), 2);
    }

    function test_ignoresSwapsFromOtherPoolsAndUnknownChains() public {
        _bootstrapBoth();
        _noMoves();
        _react(
            _rec(
                U,
                PM_U,
                SWAP,
                uint256(keccak256("other")),
                abi.encode(int128(1), int128(-1), uint160(1), uint128(1), int24(9000), uint24(3000))
            )
        );
        _react(
            _rec(
                U,
                PM_B,
                SWAP,
                uint256(POOL_U),
                abi.encode(int128(1), int128(-1), uint160(1), uint128(1), int24(9000), uint24(3000))
            )
        );
        _react(
            _rec(
                1,
                PM_U,
                SWAP,
                uint256(POOL_U),
                abi.encode(int128(1), int128(-1), uint160(1), uint128(1), int24(9000), uint24(3000))
            )
        );
        assertEq(sys.callbackCount(), 0);
    }

    // ------------------------------------------------------------------ move rule

    function test_demandShift_requestsDepartOnQuietChain() public {
        _bootstrapBoth();
        bytes32 trigger = _swap(U, 10 ether, 0);

        assertEq(sys.callbackCount(), 1);
        ISystemContract.CallbackConfiguration_V_1_0 memory cb = sys.callback(0);
        assertEq(cb.chainId, B);
        assertEq(cb.recipient, VAULT_B);
        assertEq(
            cb.payload,
            abi.encodeCall(RespoolVault.depart, (address(0), uint64(1), uint16(5_000), U, trigger))
        );
        assertEq(brain.inFlightMove(), 1);

        _swap(U, 10 ether, 0); // a move is in flight: nothing new
        assertEq(sys.callbackCount(), 1);
    }

    function _departsTo(address vault) internal view returns (uint256 n) {
        for (uint256 i = 0; i < sys.callbackCount(); i++) {
            ISystemContract.CallbackConfiguration_V_1_0 memory cb = sys.callback(i);
            if (cb.recipient == vault && bytes4(cb.payload) == RespoolVault.depart.selector) n++;
        }
    }

    function _burstParams() internal {
        RespoolBrain.Params memory p = _params();
        p.minHotDemand = 2.5 ether; // about 2.5 recent swaps: a single swap is not a trend
        brain.setParams(p);
    }

    /// Alternating equal swaps, 20 blocks apart: both chains decay alike, demand stays level
    /// (ratio about 1.3x), so nothing moves. The old rule moved on every swap the cooldown allowed.
    function test_balancedTrading_movesNothing() public {
        _bootstrapBoth();
        _burstParams();
        uint256 bn = 1000; // explicit start block: no block.number reads across vm.roll
        vm.roll(bn);
        for (uint256 i = 0; i < 20; i++) {
            bn += 20;
            vm.roll(bn);
            _swap(i % 2 == 0 ? U : B, 10 ether, 0);
        }
        assertEq(_departsTo(VAULT_U) + _departsTo(VAULT_B), 0);
    }

    /// Batch 3 found volume tracked pool depth: the deeper pool traded more per swap and kept winning.
    /// Demand now counts swaps, so 100-token swaps on one chain and 1-token swaps on the other score level.
    function test_swapSize_doesNotDecideDirection() public {
        _bootstrapBoth();
        _burstParams();
        uint256 bn = 1000;
        vm.roll(bn);
        for (uint256 i = 0; i < 20; i++) {
            bn += 20;
            vm.roll(bn);
            if (i % 2 == 0) _swap(U, 100 ether, 0);
            else _swap(B, 1 ether, 0);
        }
        assertEq(_departsTo(VAULT_U) + _departsTo(VAULT_B), 0);
    }

    /// A burst on Unichain pulls liquidity from Base; a later burst on Base pulls it back.
    function test_bursts_moveLiquidityBothWays() public {
        _bootstrapBoth();
        _burstParams();
        uint256 bn = 1000; // explicit start block: no block.number reads across vm.roll
        vm.roll(bn);
        for (uint256 i = 0; i < 4; i++) {
            bn += 20;
            vm.roll(bn);
            _swap(U, 10 ether, 0);
        }
        assertEq(_departsTo(VAULT_B), 1, "burst on Unichain should move liquidity off Base");
        assertEq(brain.moveDst(), U);
        _departed(B, 1, 1 ether, 1 ether);
        _arrived(U, 1);
        assertEq(brain.inFlightMove(), 0);

        for (uint256 i = 0; i < 6; i++) {
            bn += 20;
            vm.roll(bn);
            _swap(B, 10 ether, 0);
        }
        assertEq(_departsTo(VAULT_U), 1, "burst on Base should move liquidity off Unichain");
        assertEq(brain.moveDst(), B);
    }

    function test_noMove_belowNoiseFloor() public {
        _bootstrapBoth();
        RespoolBrain.Params memory p = _params();
        p.minHotDemand = 2 ether;
        brain.setParams(p);
        _swap(U, 10 ether, 0); // one swap = 1e18 of demand, below the 2e18 floor
        assertEq(sys.callbackCount(), 0);
    }

    function test_noMove_whenQuietChainHasNoLiquidity() public {
        _recentred(U, 0, -120, 180, 1000);
        _recentred(B, 0, -120, 180, 0);
        _swap(U, 10 ether, 0);
        assertEq(sys.callbackCount(), 0);
    }

    function test_departed_requestsArriveWithReportedAmounts_once() public {
        _bootstrapBoth();
        _swap(U, 10 ether, 0);

        bytes32 trigger = _departed(B, 1, 3 ether, 4 ether);
        assertEq(sys.callbackCount(), 2);
        ISystemContract.CallbackConfiguration_V_1_0 memory cb = sys.callback(1);
        assertEq(cb.chainId, U);
        assertEq(cb.recipient, VAULT_U);
        assertEq(
            cb.payload,
            abi.encodeCall(RespoolVault.arrive, (address(0), uint64(1), 3 ether, 4 ether, trigger))
        );

        _departed(B, 1, 3 ether, 4 ether); // duplicate observation
        _departed(B, 2, 9 ether, 9 ether); // not the in-flight move
        _departed(U, 1, 9 ether, 9 ether); // wrong chain
        assertEq(sys.callbackCount(), 2);
    }

    function test_arrived_completesMove() public {
        _bootstrapBoth();
        _swap(U, 10 ether, 0);
        _departed(B, 1, 3 ether, 4 ether);
        _arrived(U, 1);
        assertEq(brain.inFlightMove(), 0);
        assertFalse(brain.arriveRequested());
    }

    function test_retryArrive_resendsSameMove() public {
        _bootstrapBoth();
        _swap(U, 10 ether, 0);
        _departed(B, 1, 3 ether, 4 ether);
        brain.retryArrive();
        assertEq(sys.callbackCount(), 3);
        assertEq(sys.callback(2).recipient, VAULT_U);
    }
}
