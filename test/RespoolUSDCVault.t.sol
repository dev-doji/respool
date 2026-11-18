// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {ERC20, RespoolUSDCVault} from "../src/RespoolUSDCVault.sol";

contract TestUSDC is ERC20 {
    constructor() ERC20("Test USDC", "USDC", 6) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev A 6-decimal token that keeps 1% of every transferFrom, like a fee-on-transfer token.
contract FeeUSDC is ERC20 {
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

contract Token18 is ERC20 {
    constructor() ERC20("Token 18", "T18", 18) {}
}

contract RespoolUSDCVaultTest is Test {
    function testDepositAndRedeemAfterUnsolicitedTransfer() external {
        TestUSDC token = new TestUSDC();
        RespoolUSDCVault vault = new RespoolUSDCVault(token);
        token.mint(address(this), 15e6);
        token.transfer(address(vault), 5e6);
        token.approve(address(vault), 10e6);

        assertEq(vault.deposit(10e6), 10e6);
        assertEq(vault.balanceOf(address(this)), 10e6);
        assertEq(vault.redeem(4e6), 4e6);
        assertEq(vault.balanceOf(address(this)), 6e6);
        assertEq(token.balanceOf(address(this)), 4e6);
        assertEq(token.balanceOf(address(vault)), 11e6);

        vm.expectRevert();
        vault.redeem(7e6);
        assertEq(vault.balanceOf(address(this)), 6e6);
    }
}

/// @dev Failure cases and edges, added before the vault was deployed.
contract RespoolUSDCVaultEdgeTest is Test {
    TestUSDC token;
    RespoolUSDCVault vault;
    address bob = address(0xB0B);

    function setUp() public {
        token = new TestUSDC();
        vault = new RespoolUSDCVault(token);
        token.mint(address(this), 100e6);
        token.approve(address(vault), type(uint256).max);
    }

    function test_zeroAmountsRevert() public {
        vm.expectRevert(RespoolUSDCVault.ZeroAmount.selector);
        vault.deposit(0);
        vm.expectRevert(RespoolUSDCVault.ZeroAmount.selector);
        vault.redeem(0);
    }

    function test_depositWithoutApprovalReverts() public {
        token.approve(address(vault), 0);
        vm.expectRevert();
        vault.deposit(1e6);
        assertEq(vault.totalSupply(), 0);
    }

    function test_depositMoreThanBalanceReverts() public {
        vm.expectRevert();
        vault.deposit(101e6);
        assertEq(vault.totalSupply(), 0);
    }

    function test_feeOnTransferAssetIsRejectedOnDeposit() public {
        FeeUSDC fee = new FeeUSDC();
        RespoolUSDCVault feeVault = new RespoolUSDCVault(fee);
        fee.mint(address(this), 100e6);
        fee.approve(address(feeVault), type(uint256).max);
        vm.expectRevert(RespoolUSDCVault.IncorrectDeposit.selector);
        feeVault.deposit(10e6);
        assertEq(feeVault.totalSupply(), 0);
    }

    function test_constructorRejectsBadAssets() public {
        vm.expectRevert(RespoolUSDCVault.InvalidAsset.selector);
        new RespoolUSDCVault(ERC20(address(0xDEAD))); // no code at that address
        Token18 wrongDecimals = new Token18(); // deploy first: an inner deployment would consume expectRevert
        vm.expectRevert(RespoolUSDCVault.InvalidAsset.selector);
        new RespoolUSDCVault(wrongDecimals);
    }

    function test_sharesAreTransferableAndRedeemableByTheReceiver() public {
        vault.deposit(10e6);
        vault.transfer(bob, 4e6);
        assertEq(vault.balanceOf(address(this)), 6e6);

        vm.prank(bob);
        vault.redeem(4e6);
        assertEq(token.balanceOf(bob), 4e6);
        assertEq(vault.balanceOf(bob), 0);

        vm.expectRevert(); // the sender no longer has those 4e6 shares to redeem on top of what is left
        vault.redeem(7e6);
    }

    function test_noOneCanRedeemAnotherUsersShares() public {
        vault.deposit(10e6);
        vm.prank(bob);
        vm.expectRevert();
        vault.redeem(1e6);
    }

    function testFuzz_depositThenRedeemReturnsExactlyWhatWasPut(uint96 amount) public {
        amount = uint96(bound(amount, 1, 100e6));
        uint256 walletBefore = token.balanceOf(address(this));
        vault.deposit(amount);
        assertEq(vault.totalSupply(), amount);
        assertEq(token.balanceOf(address(vault)), amount);
        vault.redeem(amount);
        assertEq(token.balanceOf(address(this)), walletBefore);
        assertEq(vault.totalSupply(), 0);
        assertEq(token.balanceOf(address(vault)), 0);
    }
}
