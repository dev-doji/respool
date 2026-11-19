// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {ERC20} from "../lib/v4-core/lib/solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "../lib/v4-core/lib/solmate/src/utils/SafeTransferLib.sol";

/// @notice Testnet vault: deposits stay 1:1 redeemable, and depositors also earn a stream of test reward tokens
///         in proportion to their share.
/// @dev Principal and rewards are kept apart on purpose. `redeem` only touches the asset and the share balance, so
///      it can never be blocked by the reward token (a paused, broken or empty reward token only affects `claim`).
///      The owner funds the stream with `notifyReward`; the rewards are an emission of a worthless test token and
///      are not trading fees. While nobody is deposited, the stream still runs and that time's rewards are not paid
///      to anyone. Shares are a receipt and cannot be transferred, so rewards always belong to the depositor.
contract RespoolEarnVault is ERC20 {
    using SafeTransferLib for ERC20;

    error InvalidAsset();
    error ZeroAmount();
    error IncorrectDeposit();
    error NotOwner();
    error NonTransferable();

    event RewardAdded(uint256 amount, uint256 duration, uint256 rate);
    event Claimed(address indexed account, uint256 amount);

    uint256 internal constant PRECISION = 1e18;

    ERC20 public immutable asset;
    ERC20 public immutable rewardToken;
    address public immutable owner;

    /// Reward tokens released per second, until `periodFinish`.
    uint256 public rewardRate;
    uint256 public periodFinish;
    uint256 public lastUpdate;
    uint256 public rewardPerShareStored;
    mapping(address => uint256) public paidPerShare;
    mapping(address => uint256) public accrued;

    constructor(ERC20 asset_, ERC20 rewardToken_) ERC20("Respool Earn Share", "reUSDC", 6) {
        if (address(asset_).code.length == 0 || asset_.decimals() != 6) revert InvalidAsset();
        if (address(rewardToken_).code.length == 0 || address(rewardToken_) == address(asset_)) revert InvalidAsset();
        asset = asset_;
        rewardToken = rewardToken_;
        owner = msg.sender;
    }

    // ------------------------------------------------------------------ deposit and withdraw (principal)

    function deposit(uint256 assets) external returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        _update(msg.sender);
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
        _update(msg.sender);
        _burn(msg.sender, shares);
        // forge-lint: disable-next-line(solmate-safe-transfer-lib)
        asset.safeTransfer(msg.sender, shares);
        return shares;
    }

    // ------------------------------------------------------------------ rewards

    /// @notice Pay out everything earned so far. Never needed to get the deposit back.
    function claim() external returns (uint256 amount) {
        _update(msg.sender);
        amount = accrued[msg.sender];
        if (amount > 0) {
            accrued[msg.sender] = 0;
            rewardToken.safeTransfer(msg.sender, amount);
            emit Claimed(msg.sender, amount);
        }
    }

    /// @notice Add `amount` reward tokens (pulled from the owner) to be released evenly over `duration` seconds.
    ///         Anything still unreleased from an earlier period is rolled into the new one.
    function notifyReward(uint256 amount, uint256 duration) external {
        if (msg.sender != owner) revert NotOwner();
        if (amount == 0 || duration == 0) revert ZeroAmount();
        _update(address(0));
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        if (block.timestamp >= periodFinish) {
            rewardRate = amount / duration;
        } else {
            uint256 left = (periodFinish - block.timestamp) * rewardRate;
            rewardRate = (amount + left) / duration;
        }
        lastUpdate = block.timestamp;
        periodFinish = block.timestamp + duration;
        emit RewardAdded(amount, duration, rewardRate);
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function rewardPerShare() public view returns (uint256) {
        if (totalSupply == 0) return rewardPerShareStored;
        return rewardPerShareStored + ((lastTimeRewardApplicable() - lastUpdate) * rewardRate * PRECISION) / totalSupply;
    }

    /// @notice Reward tokens `account` has earned and not yet claimed.
    function earned(address account) public view returns (uint256) {
        return (balanceOf[account] * (rewardPerShare() - paidPerShare[account])) / PRECISION + accrued[account];
    }

    function _update(address account) internal {
        rewardPerShareStored = rewardPerShare();
        lastUpdate = lastTimeRewardApplicable();
        if (account != address(0)) {
            accrued[account] = earned(account);
            paidPerShare[account] = rewardPerShareStored;
        }
    }

    // ------------------------------------------------------------------ shares are a receipt

    function transfer(address, uint256) public pure override returns (bool) {
        revert NonTransferable();
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert NonTransferable();
    }
}
