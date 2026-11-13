// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/// @title RespoolToken
/// @notice TEST-ONLY ERC-20 used to demonstrate cross-chain liquidity moves on testnets.
///         Minters (the local RespoolVault, plus the deployer for demo traders) can mint;
///         a minter can burn its own balance. It has no value and is not a bridged asset.
contract RespoolToken {
    error NotOwner();
    error NotMinter();
    error InsufficientBalance();
    error InsufficientAllowance();

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event MinterSet(address indexed minter, bool allowed);

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    address public immutable owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public minters;

    constructor(string memory name_, string memory symbol_) {
        name = name_;
        symbol = symbol_;
        owner = msg.sender;
    }

    function setMinter(address minter, bool allowed) external {
        if (msg.sender != owner) revert NotOwner();
        minters[minter] = allowed;
        emit MinterSet(minter, allowed);
    }

    function mint(address to, uint256 amount) external {
        if (!minters[msg.sender]) revert NotMinter();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    /// @notice Burns `amount` of the caller's own balance. Minters only.
    function burn(uint256 amount) external {
        if (!minters[msg.sender]) revert NotMinter();
        _debit(msg.sender, amount);
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _debit(msg.sender, amount);
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - amount;
        }
        _debit(from, amount);
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function _debit(address from, uint256 amount) private {
        uint256 bal = balanceOf[from];
        if (bal < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = bal - amount;
        }
    }
}
