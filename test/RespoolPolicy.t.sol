// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {RespoolPolicy} from "../src/RespoolPolicy.sol";

/// @dev External wrapper so reverts from internal library functions can be caught with expectRevert.
contract PolicyHarness {
    function floorToSpacing(int24 t, int24 s) external pure returns (int24) {
        return RespoolPolicy.floorToSpacing(t, s);
    }

    function centredRange(int24 t, int24 s, int24 w) external pure returns (int24, int24) {
        return RespoolPolicy.centredRange(t, s, w);
    }
}

contract RespoolPolicyTest is Test {
    PolicyHarness h;

    function setUp() public {
        h = new PolicyHarness();
    }

    function test_outOfRange_isHalfOpen() public pure {
        assertFalse(RespoolPolicy.outOfRange(-60, -60, 60));
        assertFalse(RespoolPolicy.outOfRange(59, -60, 60));
        assertTrue(RespoolPolicy.outOfRange(60, -60, 60));
        assertTrue(RespoolPolicy.outOfRange(-61, -60, 60));
    }

    function test_floorToSpacing_roundsTowardsNegativeInfinity() public view {
        assertEq(h.floorToSpacing(125, 60), 120);
        assertEq(h.floorToSpacing(120, 60), 120);
        assertEq(h.floorToSpacing(-1, 60), -60);
        assertEq(h.floorToSpacing(-60, 60), -60);
        assertEq(h.floorToSpacing(-61, 60), -120);
    }

    function test_floorToSpacing_rejectsBadSpacing() public {
        vm.expectRevert(RespoolPolicy.InvalidSpacing.selector);
        h.floorToSpacing(1, 0);
    }

    function test_centredRange_containsTick() public view {
        (int24 lo, int24 hi) = h.centredRange(125, 60, 2);
        assertEq(lo, 0);
        assertEq(hi, 300);
        assertFalse(RespoolPolicy.outOfRange(125, lo, hi));
    }

    function testFuzz_centredRange_alwaysContainsTick(int24 tick, uint8 w) public view {
        tick = int24(bound(int256(tick), -800_000, 800_000));
        int24 width = int24(uint24(bound(w, 1, 50)));
        (int24 lo, int24 hi) = h.centredRange(tick, 60, width);
        assertFalse(RespoolPolicy.outOfRange(tick, lo, hi));
        assertEq(lo % 60, 0);
        assertEq(hi % 60, 0);
    }

    function test_absAmount_handlesMin() public pure {
        assertEq(RespoolPolicy.absAmount(-5), 5);
        assertEq(RespoolPolicy.absAmount(5), 5);
        assertEq(RespoolPolicy.absAmount(type(int128).min), uint256(uint128(type(int128).max)) + 1);
    }

    function test_ewma() public pure {
        assertEq(RespoolPolicy.ewma(1000, 0, 2_000), 800);
        assertEq(RespoolPolicy.ewma(0, 1000, 2_000), 200);
        assertEq(RespoolPolicy.ewma(1000, 5000, 10_000), 5000);
    }

    function test_shouldMove_rules() public pure {
        // 2x ratio met, no move in flight, cooldown passed.
        assertTrue(RespoolPolicy.shouldMove(200, 100, 20_000, 1, false, 10, 5));
        // Ratio not met.
        assertFalse(RespoolPolicy.shouldMove(199, 100, 20_000, 1, false, 10, 5));
        // Move already in flight.
        assertFalse(RespoolPolicy.shouldMove(1000, 1, 20_000, 1, true, 10, 5));
        // Cooldown not passed.
        assertFalse(RespoolPolicy.shouldMove(1000, 1, 20_000, 1, false, 4, 5));
        // Below noise floor.
        assertFalse(RespoolPolicy.shouldMove(10, 0, 20_000, 11, false, 10, 5));
    }
}
