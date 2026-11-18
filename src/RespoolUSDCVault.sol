// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {ERC20} from "../lib/v4-core/lib/solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "../lib/v4-core/lib/solmate/src/utils/SafeTransferLib.sol";

/// @notice Testnet custody vault. Each share is backed by one unit of test USDC.
contract RespoolUSDCVault is ERC20 {
    using SafeTransferLib for ERC20;

    error InvalidAsset();
    error ZeroAmount();
    error IncorrectDeposit();

    ERC20 public immutable asset;

    constructor(ERC20 asset_) ERC20("Respool Test USDC Share", "rsUSDC", 6) {
        if (address(asset_).code.length == 0 || asset_.decimals() != 6) revert InvalidAsset();
        asset = asset_;
    }

    function deposit(uint256 assets) external returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        uint256 balanceBefore = asset.balanceOf(address(this));
        // The asset is checked to be a contract in the constructor, which is what SafeTransferLib assumes.
        // forge-lint: disable-next-line(solmate-safe-transfer-lib)
        asset.safeTransferFrom(msg.sender, address(this), assets);
        // Strict equality is the point: any shortfall (fee-on-transfer) must revert so shares stay 1:1 backed.
        // forge-lint: disable-next-line(incorrect-strict-equality)
        if (asset.balanceOf(address(this)) != balanceBefore + assets) revert IncorrectDeposit();
        _mint(msg.sender, assets);
        return assets;
    }

    function redeem(uint256 shares) external returns (uint256 assets) {
        if (shares == 0) revert ZeroAmount();
        _burn(msg.sender, shares);
        // forge-lint: disable-next-line(solmate-safe-transfer-lib)
        asset.safeTransfer(msg.sender, shares);
        return shares;
    }
}
