// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {AbstractPayer} from "@reactive/src/base/AbstractPayer.sol";
import {AbstractCallback} from "@reactive/src/base/AbstractCallback.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";

import {RespoolToken} from "../src/RespoolToken.sol";
import {RespoolVault} from "../src/RespoolVault.sol";
import {RespoolPolicy} from "../src/RespoolPolicy.sol";

/// @dev Two pools on one local PoolManager stand in for "Unichain" and "Base". The callback proxy and the
///      brain are plain addresses: the test pranks as the proxy and passes the brain as the injected sender.
contract RespoolVaultTest is Test {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint160 constant SQRT_PRICE_1_1 = 79228162514264337593543950336;
    address constant PROXY = address(0xBEEF);
    address constant BRAIN = address(0xB0B);
    uint256 constant SEED = 100 ether;

    IPoolManager pm;
    PoolSwapTest router;

    struct Side {
        RespoolToken t0;
        RespoolToken t1;
        PoolKey key;
        RespoolVault vault;
    }

    Side a;
    Side b;

    function setUp() public {
        pm = IPoolManager(deployCode("PoolManager.sol:PoolManager", abi.encode(address(this))));
        router = new PoolSwapTest(pm);
        a = _side("A");
        b = _side("B");
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
        s.vault = new RespoolVault(IPayable(payable(PROXY)), BRAIN, pm, s.key, 2);
        s.t0.setMinter(address(s.vault), true);
        s.t1.setMinter(address(s.vault), true);
        // The test contract trades, so it mints itself demo balances.
        s.t0.setMinter(address(this), true);
        s.t1.setMinter(address(this), true);
        s.t0.mint(address(this), 1_000 ether);
        s.t1.mint(address(this), 1_000 ether);
        s.t0.approve(address(router), type(uint256).max);
        s.t1.approve(address(router), type(uint256).max);
        s.vault.bootstrap(SEED, SEED);
    }

    function _tick(Side memory s) internal view returns (int24 tick) {
        (, tick,,) = pm.getSlot0(s.key.toId());
    }

    /// Sell token0 until the price reaches `limitTick` (or the input runs out).
    function _pushDown(Side memory s, int24 limitTick) internal {
        router.swap(
            s.key,
            SwapParams({
                zeroForOne: true,
                amountSpecified: -int256(500 ether),
                sqrtPriceLimitX96: TickMath.getSqrtPriceAtTick(limitTick)
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    // ------------------------------------------------------------------ bootstrap

    function test_bootstrap_opensPositionAroundTick() public view {
        assertGt(a.vault.liquidity(), 0);
        assertEq(a.vault.tickLower(), -120);
        assertEq(a.vault.tickUpper(), 180);
        assertFalse(RespoolPolicy.outOfRange(_tick(a), a.vault.tickLower(), a.vault.tickUpper()));
    }

    function test_bootstrap_onlyOwner() public {
        vm.prank(address(0xCAFE));
        vm.expectRevert(RespoolVault.NotOwner.selector);
        a.vault.bootstrap(1, 1);
    }

    // ------------------------------------------------------------------ auth

    function test_callback_rejectsNonProxyCaller() public {
        vm.expectRevert(abi.encodeWithSelector(AbstractPayer.NotAuthorized.selector, address(this), PROXY));
        a.vault.recentre(BRAIN, 1, 0, bytes32(0));
    }

    function test_callback_rejectsWrongReactiveSender() public {
        vm.prank(PROXY);
        vm.expectRevert(
            abi.encodeWithSelector(AbstractCallback.CallbackNotAuthorized.selector, address(0xBAD), BRAIN)
        );
        a.vault.recentre(address(0xBAD), 1, 0, bytes32(0));
    }

    // ------------------------------------------------------------------ recentre

    function test_recentre_followsPriceOutOfRange() public {
        _pushDown(a, -600);
        int24 tick = _tick(a);
        assertTrue(RespoolPolicy.outOfRange(tick, a.vault.tickLower(), a.vault.tickUpper()));

        vm.prank(PROXY);
        a.vault.recentre(BRAIN, 1, tick, keccak256("swap-tx"));

        assertFalse(RespoolPolicy.outOfRange(tick, a.vault.tickLower(), a.vault.tickUpper()));
        assertGt(a.vault.liquidity(), 0);
        assertEq(a.vault.lastRecentreSeq(), 1);
    }

    function test_recentre_skipsWhenStillInRange() public {
        uint128 before = a.vault.liquidity();
        vm.expectEmit(true, false, false, true, address(a.vault));
        emit RespoolVault.CallbackSkipped(1, 2, bytes32(0));
        vm.prank(PROXY);
        a.vault.recentre(BRAIN, 1, 0, bytes32(0));
        assertEq(a.vault.liquidity(), before);
    }

    function test_recentre_ignoresStaleOrDuplicateSeq() public {
        _pushDown(a, -600);
        vm.prank(PROXY);
        a.vault.recentre(BRAIN, 5, 0, bytes32(0));
        (int24 lo, int24 hi) = (a.vault.tickLower(), a.vault.tickUpper());

        _pushDown(a, -1200);
        vm.expectEmit(true, false, false, true, address(a.vault));
        emit RespoolVault.CallbackSkipped(5, 1, bytes32(0));
        vm.prank(PROXY);
        a.vault.recentre(BRAIN, 5, 0, bytes32(0)); // duplicate delivery
        vm.prank(PROXY);
        a.vault.recentre(BRAIN, 4, 0, bytes32(0)); // out-of-order older one

        assertEq(a.vault.tickLower(), lo);
        assertEq(a.vault.tickUpper(), hi);
    }

    // ------------------------------------------------------------------ depart / arrive

    function test_depart_removesShareAndBurns() public {
        uint128 lBefore = a.vault.liquidity();
        uint256 s0 = a.t0.totalSupply();
        uint256 s1 = a.t1.totalSupply();

        vm.prank(PROXY);
        a.vault.depart(BRAIN, 1, 5_000, 84532, bytes32(0));

        assertApproxEqAbs(a.vault.liquidity(), lBefore / 2, 1);
        assertLt(a.t0.totalSupply(), s0);
        assertLt(a.t1.totalSupply(), s1);
        assertTrue(a.vault.departed(1));
    }

    function test_depart_duplicateIsNoOp() public {
        vm.prank(PROXY);
        a.vault.depart(BRAIN, 1, 5_000, 84532, bytes32(0));
        uint128 l = a.vault.liquidity();
        uint256 s0 = a.t0.totalSupply();

        vm.prank(PROXY);
        a.vault.depart(BRAIN, 1, 5_000, 84532, bytes32(0));
        assertEq(a.vault.liquidity(), l);
        assertEq(a.t0.totalSupply(), s0);
    }

    function test_depart_rejectsBadShare() public {
        vm.prank(PROXY);
        vm.expectRevert(RespoolVault.InvalidShare.selector);
        a.vault.depart(BRAIN, 1, 10_001, 84532, bytes32(0));
    }

    function test_arrive_mintsAndAddsLiquidity_onceOnly() public {
        uint128 lBefore = b.vault.liquidity();
        vm.prank(PROXY);
        b.vault.arrive(BRAIN, 7, 10 ether, 10 ether, bytes32(0));
        uint128 lAfter = b.vault.liquidity();
        assertGt(lAfter, lBefore);

        uint256 s0 = b.t0.totalSupply();
        vm.prank(PROXY);
        b.vault.arrive(BRAIN, 7, 10 ether, 10 ether, bytes32(0));
        assertEq(b.vault.liquidity(), lAfter);
        assertEq(b.t0.totalSupply(), s0);
    }

    /// The full move as the brain would drive it: depart on A, then arrive on B with exactly the amounts
    /// A reported. Test-token supply across both "chains" is conserved.
    function test_move_conservesSupplyAcrossChains() public {
        uint256 total0 = a.t0.totalSupply() + b.t0.totalSupply();
        uint256 total1 = a.t1.totalSupply() + b.t1.totalSupply();
        uint256 aBefore0 = a.t0.totalSupply();
        uint256 aBefore1 = a.t1.totalSupply();

        vm.prank(PROXY);
        a.vault.depart(BRAIN, 1, 4_000, 84532, bytes32(0));
        uint256 moved0 = aBefore0 - a.t0.totalSupply();
        uint256 moved1 = aBefore1 - a.t1.totalSupply();
        assertGt(moved0, 0);
        assertGt(moved1, 0);

        uint128 bBefore = b.vault.liquidity();
        vm.prank(PROXY);
        b.vault.arrive(BRAIN, 1, moved0, moved1, bytes32(0));

        assertEq(a.t0.totalSupply() + b.t0.totalSupply(), total0);
        assertEq(a.t1.totalSupply() + b.t1.totalSupply(), total1);
        assertGt(b.vault.liquidity(), bBefore);
    }

    function test_unlockCallback_onlyPoolManager() public {
        vm.expectRevert(RespoolVault.NotPoolManager.selector);
        a.vault.unlockCallback(abi.encode(RespoolVault.Action.Reposition, uint128(0)));
    }
}
