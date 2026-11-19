// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {ERC20} from "../lib/v4-core/lib/solmate/src/tokens/ERC20.sol";

/// @notice Testnet reward token paid to depositors of RespoolEarnVault. It has no value: the owner mints it to
///         fund the reward stream, and the app labels it as a test reward.
contract RespoolRewardToken is ERC20 {
    error NotOwner();

    address public immutable owner;

    constructor() ERC20("Respool Test Reward", "tRSP", 18) {
        owner = msg.sender;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        _mint(to, amount);
    }
}
