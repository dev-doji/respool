// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "../lib/v4-core/lib/solmate/src/tokens/ERC20.sol";
import {RespoolEarnVault} from "../src/RespoolEarnVault.sol";
import {RespoolRewardToken} from "../src/RespoolRewardToken.sol";

contract EarnTestUSDC is ERC20 {
    constructor() ERC20("Test USDC", "USDC", 6) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev A 6-decimal token that keeps 1% of every transferFrom.
contract EarnFeeUSDC is ERC20 {
    constructor() ERC20("Fee USDC", "fUSDC", 6) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        uint256 fee = amount / 100;
        balanceOf[to] += amount - fee;
        totalSupply -= fee;
        emit Transfer(from, to, amount - fee);
        return true;
    }
}

/// @dev A reward token whose transfers can be switched off, to prove principal never depends on it.
contract BrokenReward is ERC20 {
    bool public broken;

    constructor() ERC20("Broken", "BRK", 18) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function breakIt() external {
        broken = true;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        require(!broken, "broken");
        return super.transfer(to, amount);
    }
}

contract RespoolEarnVaultTest is Test {
    EarnTestUSDC usdc;
    RespoolRewardToken reward;
    RespoolEarnVault vault;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 constant DAY = 1 days;
    // 1,000 reward tokens per day for 10 days.
    uint256 constant FUND = 10_000e18;

    function setUp() public {
        usdc = new EarnTestUSDC();
        reward = new RespoolRewardToken();
        vault = new RespoolEarnVault(usdc, reward);
        usdc.mint(alice, 100e6);
        usdc.mint(bob, 100e6);
        reward.mint(address(this), FUND);
        reward.approve(address(vault), type(uint256).max);
        vm.prank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(vault), type(uint256).max);
    }

    function _deposit(address who, uint256 amount) internal {
        vm.prank(who);
        vault.deposit(amount);
    }

    // ---------------------------------------------------------------- principal

    function testDepositAndRedeemAreOneToOne() external {
        _deposit(alice, 10e6);
        assertEq(vault.balanceOf(alice), 10e6);
        assertEq(usdc.balanceOf(address(vault)), 10e6);
        vm.prank(alice);
        assertEq(vault.redeem(4e6), 4e6);
        assertEq(usdc.balanceOf(alice), 94e6);
        assertEq(vault.balanceOf(alice), 6e6);
    }

    function testRedeemWorksWithNoRewardsAtAll() external {
        _deposit(alice, 10e6);
        vm.warp(block.timestamp + 5 * DAY);
        vm.prank(alice);
        vault.redeem(10e6);
        assertEq(usdc.balanceOf(alice), 100e6);
        assertEq(vault.earned(alice), 0);
    }

    function testRedeemWorksEvenIfTheRewardTokenIsBroken() external {
        BrokenReward broken = new BrokenReward();
        RespoolEarnVault v = new RespoolEarnVault(usdc, broken);
        broken.mint(address(this), FUND);
        broken.approve(address(v), type(uint256).max);
        vm.prank(alice);
        usdc.approve(address(v), type(uint256).max);
        vm.prank(alice);
        v.deposit(10e6);
        v.notifyReward(FUND, 10 * DAY);
        vm.warp(block.timestamp + 2 * DAY);
        broken.breakIt();
        vm.prank(alice);
        vm.expectRevert();
        v.claim();
        // The deposit still comes back in full.
        vm.prank(alice);
        v.redeem(10e6);
        assertEq(usdc.balanceOf(alice), 100e6);
    }

    function testCannotRedeemMoreThanDeposited() external {
        _deposit(alice, 10e6);
        vm.prank(alice);
        vm.expectRevert();
        vault.redeem(11e6);
    }

    function testZeroAmountsRevert() external {
        vm.expectRevert(RespoolEarnVault.ZeroAmount.selector);
        vault.deposit(0);
        vm.expectRevert(RespoolEarnVault.ZeroAmount.selector);
        vault.redeem(0);
    }

    function testFeeOnTransferAssetCannotMintUnbackedShares() external {
        EarnFeeUSDC fee = new EarnFeeUSDC();
        RespoolEarnVault v = new RespoolEarnVault(fee, reward);
        fee.mint(alice, 100e6);
        vm.startPrank(alice);
        fee.approve(address(v), type(uint256).max);
        vm.expectRevert(RespoolEarnVault.IncorrectDeposit.selector);
        v.deposit(10e6);
        vm.stopPrank();
    }

    function testAssetAndRewardMustDiffer() external {
        vm.expectRevert(RespoolEarnVault.InvalidAsset.selector);
        new RespoolEarnVault(usdc, ERC20(address(usdc)));
    }

    function testSharesCannotBeTransferred() external {
        _deposit(alice, 10e6);
        vm.prank(alice);
        vm.expectRevert(RespoolEarnVault.NonTransferable.selector);
        vault.transfer(bob, 1e6);
        vm.prank(bob);
        vm.expectRevert(RespoolEarnVault.NonTransferable.selector);
        vault.transferFrom(alice, bob, 1e6);
    }

    // ---------------------------------------------------------------- rewards

    function testOnlyOwnerFundsRewards() external {
        vm.prank(alice);
        vm.expectRevert(RespoolEarnVault.NotOwner.selector);
        vault.notifyReward(1e18, DAY);
        vm.expectRevert(RespoolEarnVault.ZeroAmount.selector);
        vault.notifyReward(0, DAY);
        vm.expectRevert(RespoolEarnVault.ZeroAmount.selector);
        vault.notifyReward(1e18, 0);
    }

    function testSoleDepositorEarnsTheWholeStream() external {
        _deposit(alice, 10e6);
        vault.notifyReward(FUND, 10 * DAY);
        vm.warp(block.timestamp + 10 * DAY);
        assertApproxEqAbs(vault.earned(alice), FUND, 1e6);
        vm.prank(alice);
        uint256 got = vault.claim();
        assertEq(reward.balanceOf(alice), got);
        assertApproxEqAbs(got, FUND, 1e6);
        assertEq(vault.earned(alice), 0);
    }

    function testRewardsStopAtTheEndOfThePeriod() external {
        _deposit(alice, 10e6);
        vault.notifyReward(FUND, 10 * DAY);
        vm.warp(block.timestamp + 30 * DAY);
        assertApproxEqAbs(vault.earned(alice), FUND, 1e6);
    }

    function testRewardsAreSharedInProportion() external {
        _deposit(alice, 10e6);
        _deposit(bob, 30e6);
        vault.notifyReward(FUND, 10 * DAY);
        vm.warp(block.timestamp + 10 * DAY);
        assertApproxEqAbs(vault.earned(alice), FUND / 4, 1e6);
        assertApproxEqAbs(vault.earned(bob), (FUND * 3) / 4, 1e6);
    }

    function testALateDepositorOnlyEarnsFromWhenTheyJoined() external {
        _deposit(alice, 10e6);
        vault.notifyReward(FUND, 10 * DAY);
        vm.warp(block.timestamp + 5 * DAY);
        _deposit(bob, 10e6);
        vm.warp(block.timestamp + 5 * DAY);
        // Alice: all of the first half, half of the second. Bob: half of the second.
        assertApproxEqAbs(vault.earned(alice), (FUND * 3) / 4, 1e6);
        assertApproxEqAbs(vault.earned(bob), FUND / 4, 1e6);
    }

    function testLeavingKeepsWhatWasEarnedAndStopsEarning() external {
        _deposit(alice, 10e6);
        vault.notifyReward(FUND, 10 * DAY);
        vm.warp(block.timestamp + 5 * DAY);
        vm.prank(alice);
        vault.redeem(10e6);
        uint256 atExit = vault.earned(alice);
        assertApproxEqAbs(atExit, FUND / 2, 1e6);
        vm.warp(block.timestamp + 5 * DAY);
        assertEq(vault.earned(alice), atExit);
        vm.prank(alice);
        vault.claim();
        assertEq(reward.balanceOf(alice), atExit);
    }

    function testTimeWithNobodyDepositedIsNotPaidToALaterDepositor() external {
        vault.notifyReward(FUND, 10 * DAY);
        vm.warp(block.timestamp + 5 * DAY);
        _deposit(alice, 10e6);
        vm.warp(block.timestamp + 5 * DAY);
        // Only the second half of the stream is earned.
        assertApproxEqAbs(vault.earned(alice), FUND / 2, 1e6);
    }

    function testFundingAgainRollsTheLeftoverIntoTheNewPeriod() external {
        _deposit(alice, 10e6);
        vault.notifyReward(FUND / 2, 10 * DAY);
        vm.warp(block.timestamp + 5 * DAY);
        reward.mint(address(this), FUND);
        vault.notifyReward(FUND / 2, 10 * DAY);
        vm.warp(block.timestamp + 10 * DAY);
        // Everything that was funded has been released: 5,000 over the first 5 days' share plus the roll.
        assertApproxEqAbs(vault.earned(alice), FUND / 2 + FUND / 2, 1e6);
    }

    function testClaimWithNothingEarnedPaysNothing() external {
        _deposit(alice, 10e6);
        vm.prank(alice);
        assertEq(vault.claim(), 0);
    }

    function testRewardsPaidNeverExceedRewardsFunded(uint96 a, uint96 b, uint32 t1, uint32 t2) external {
        uint256 da = bound(uint256(a), 1e6, 100e6);
        uint256 db = bound(uint256(b), 1e6, 100e6);
        _deposit(alice, da);
        vault.notifyReward(FUND, 10 * DAY);
        vm.warp(block.timestamp + bound(uint256(t1), 1, 6 * DAY));
        _deposit(bob, db);
        vm.warp(block.timestamp + bound(uint256(t2), 1, 20 * DAY));
        vm.prank(alice);
        uint256 pa = vault.claim();
        vm.prank(bob);
        uint256 pb = vault.claim();
        assertLe(pa + pb, FUND);
    }
}
