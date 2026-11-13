// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {AbstractCallback} from "@reactive/src/base/AbstractCallback.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

import {RespoolPolicy} from "./RespoolPolicy.sol";
import {RespoolLiquidity} from "./RespoolLiquidity.sol";
import {RespoolToken} from "./RespoolToken.sol";

/// @title RespoolVault
/// @notice Holds one Uniswap v4 position in the Respool pool on its chain and acts on callbacks from
///         RespoolBrain (a reactive contract on Reactive Network).
/// @dev Trust model: callbacks are accepted only from the chain's Reactive callback proxy, and only when
///      the proxy-injected sender is our brain. `arrive` mints test tokens, so the brain must only request
///      it for a matching `Departed` event on the other chain. Every callback is idempotent.
contract RespoolVault is AbstractCallback, IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    error NotOwner();
    error NotPoolManager();
    error InvalidShare();
    error TokenTransferFailed();

    enum Action {
        Reposition,
        RemoveShare
    }

    /// Reasons a callback did nothing.
    uint8 internal constant SKIP_STALE_SEQ = 1;
    uint8 internal constant SKIP_IN_RANGE = 2;
    uint8 internal constant SKIP_DUPLICATE = 3;

    event Recentred(
        uint64 indexed seq, int24 tick, int24 tickLower, int24 tickUpper, uint128 liquidity, bytes32 trigger
    );
    event Departed(
        uint64 indexed moveId,
        uint256 dstChainId,
        uint256 amount0,
        uint256 amount1,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        bytes32 trigger
    );
    event Arrived(
        uint64 indexed moveId,
        uint256 amount0,
        uint256 amount1,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        bytes32 trigger
    );
    event CallbackSkipped(uint64 indexed id, uint8 reason, bytes32 trigger);

    IPoolManager public immutable POOL_MANAGER;
    RespoolToken public immutable TOKEN0;
    RespoolToken public immutable TOKEN1;
    PoolId public immutable POOL_ID;
    int24 public immutable TICK_SPACING;
    int24 public immutable HALF_WIDTH;
    address public immutable owner;

    PoolKey internal _key;

    int24 public tickLower;
    int24 public tickUpper;
    uint128 public liquidity;
    uint64 public lastRecentreSeq;
    mapping(uint64 => bool) public departed;
    mapping(uint64 => bool) public arrived;

    constructor(
        IPayable callbackProxy_,
        address brain_,
        IPoolManager poolManager_,
        PoolKey memory key_,
        int24 halfWidth_
    ) payable AbstractCallback(callbackProxy_, brain_) {
        POOL_MANAGER = poolManager_;
        TOKEN0 = RespoolToken(Currency.unwrap(key_.currency0));
        TOKEN1 = RespoolToken(Currency.unwrap(key_.currency1));
        POOL_ID = key_.toId();
        TICK_SPACING = key_.tickSpacing;
        HALF_WIDTH = halfWidth_;
        owner = msg.sender;
        _key = key_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ------------------------------------------------------------------ callbacks (from Reactive)

    /// @notice Re-centre the position on the live tick. `observedTick` is what the brain saw; the vault
    ///         reads the live price itself and skips if the position is already in range.
    function recentre(address rvm, uint64 seq, int24 observedTick, bytes32 trigger)
        external
        onlyServiceProvider
        onlyCallbackSender(rvm)
    {
        observedTick; // logged by the brain; the live tick is authoritative here.
        if (seq <= lastRecentreSeq) {
            emit CallbackSkipped(seq, SKIP_STALE_SEQ, trigger);
            return;
        }
        lastRecentreSeq = seq;
        (, int24 tick,,) = POOL_MANAGER.getSlot0(POOL_ID);
        if (liquidity > 0 && !RespoolPolicy.outOfRange(tick, tickLower, tickUpper)) {
            emit CallbackSkipped(seq, SKIP_IN_RANGE, trigger);
            return;
        }
        _unlock(Action.Reposition, 0);
        emit Recentred(seq, tick, tickLower, tickUpper, liquidity, trigger);
    }

    /// @notice Pull `shareBps` of the position out and burn it so it can arrive on `dstChainId`.
    function depart(address rvm, uint64 moveId, uint16 shareBps, uint256 dstChainId, bytes32 trigger)
        external
        onlyServiceProvider
        onlyCallbackSender(rvm)
    {
        if (departed[moveId]) {
            emit CallbackSkipped(moveId, SKIP_DUPLICATE, trigger);
            return;
        }
        if (shareBps == 0 || shareBps > 10_000) revert InvalidShare();
        departed[moveId] = true;

        uint256 amount0 = 0;
        uint256 amount1 = 0;
        // Casting is safe: liquidity * shareBps / 10_000 <= liquidity, which is a uint128.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint128 toRemove = uint128((uint256(liquidity) * shareBps) / 10_000);
        if (toRemove > 0) {
            (amount0, amount1) = abi.decode(_unlock(Action.RemoveShare, toRemove), (uint256, uint256));
            if (amount0 > 0) TOKEN0.burn(amount0);
            if (amount1 > 0) TOKEN1.burn(amount1);
        }
        emit Departed(moveId, dstChainId, amount0, amount1, tickLower, tickUpper, liquidity, trigger);
    }

    /// @notice Mint what departed from the other chain and put it to work around the live tick.
    function arrive(address rvm, uint64 moveId, uint256 amount0, uint256 amount1, bytes32 trigger)
        external
        onlyServiceProvider
        onlyCallbackSender(rvm)
    {
        if (arrived[moveId]) {
            emit CallbackSkipped(moveId, SKIP_DUPLICATE, trigger);
            return;
        }
        arrived[moveId] = true;
        if (amount0 > 0) TOKEN0.mint(address(this), amount0);
        if (amount1 > 0) TOKEN1.mint(address(this), amount1);
        _unlock(Action.Reposition, 0);
        emit Arrived(moveId, amount0, amount1, tickLower, tickUpper, liquidity, trigger);
    }

    // ------------------------------------------------------------------ owner

    /// @notice Seed the vault with test tokens and open the first position around the live tick.
    function bootstrap(uint256 amount0, uint256 amount1) external onlyOwner {
        if (amount0 > 0) TOKEN0.mint(address(this), amount0);
        if (amount1 > 0) TOKEN1.mint(address(this), amount1);
        _unlock(Action.Reposition, 0);
        (, int24 tick,,) = POOL_MANAGER.getSlot0(POOL_ID);
        emit Recentred(0, tick, tickLower, tickUpper, liquidity, bytes32(0));
    }

    /// @notice Settle any callback debt to the proxy from this contract's ETH balance.
    function coverDebt() external {
        _coverDebt();
    }

    function withdrawEth(address payable to, uint256 amount) external onlyOwner {
        _pay(to, amount);
    }

    function poolKey() external view returns (PoolKey memory) {
        return _key;
    }

    // ------------------------------------------------------------------ Uniswap v4

    function _unlock(Action action, uint128 arg) internal returns (bytes memory) {
        return POOL_MANAGER.unlock(abi.encode(action, arg));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(POOL_MANAGER)) revert NotPoolManager();
        (Action action, uint128 arg) = abi.decode(data, (Action, uint128));

        if (action == Action.RemoveShare) {
            (uint256 a0, uint256 a1) = _remove(arg);
            return abi.encode(a0, a1);
        }

        // Reposition: close the whole position, then reopen with every idle token around the live tick.
        if (liquidity > 0) _remove(liquidity);
        _addAllIdle();
        return "";
    }

    function _remove(uint128 amount) internal returns (uint256 a0, uint256 a1) {
        // feesAccrued is already included in the caller delta, so it is not needed separately.
        // forge-lint: disable-start(unused-return)
        (BalanceDelta delta,) = POOL_MANAGER.modifyLiquidity(
            _key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: -int256(uint256(amount)),
                salt: bytes32(0)
            }),
            ""
        );
        // forge-lint: disable-end(unused-return)
        liquidity -= amount;
        a0 = _takePositive(_key.currency0, delta.amount0());
        a1 = _takePositive(_key.currency1, delta.amount1());
    }

    function _addAllIdle() internal {
        (uint160 sqrtP, int24 tick,,) = POOL_MANAGER.getSlot0(POOL_ID);
        (int24 lo, int24 hi) = _rangeAround(tick);
        tickLower = lo;
        tickUpper = hi;

        // Keep 2 wei back per token: v4 rounds amounts owed up, our liquidity maths rounds down.
        uint256 b0 = TOKEN0.balanceOf(address(this));
        uint256 b1 = TOKEN1.balanceOf(address(this));
        b0 = b0 > 2 ? b0 - 2 : 0;
        b1 = b1 > 2 ? b1 - 2 : 0;

        uint128 l = RespoolLiquidity.forAmounts(
            sqrtP, TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), b0, b1
        );
        if (l == 0) return;

        // forge-lint: disable-start(unused-return)
        (BalanceDelta delta,) = POOL_MANAGER.modifyLiquidity(
            _key,
            ModifyLiquidityParams({
                tickLower: lo, tickUpper: hi, liquidityDelta: int256(uint256(l)), salt: bytes32(0)
            }),
            ""
        );
        // forge-lint: disable-end(unused-return)
        liquidity += l;
        _settle(_key.currency0, TOKEN0, delta.amount0());
        _settle(_key.currency1, TOKEN1, delta.amount1());
    }

    function _rangeAround(int24 tick) internal view returns (int24 lo, int24 hi) {
        (lo, hi) = RespoolPolicy.centredRange(tick, TICK_SPACING, HALF_WIDTH);
        int24 minTick = TickMath.minUsableTick(TICK_SPACING);
        int24 maxTick = TickMath.maxUsableTick(TICK_SPACING);
        if (lo < minTick) lo = minTick;
        if (hi > maxTick) hi = maxTick;
    }

    function _takePositive(Currency currency, int128 amount) internal returns (uint256 taken) {
        if (amount <= 0) return 0;
        // Casting is safe: amount is positive.
        // forge-lint: disable-next-line(unsafe-typecast)
        taken = uint256(uint128(amount));
        POOL_MANAGER.take(currency, address(this), taken);
    }

    function _settle(Currency currency, RespoolToken token, int128 amount) internal {
        if (amount >= 0) {
            _takePositive(currency, amount);
            return;
        }
        // Casting is safe: amount is negative and not type(int128).min for any realistic position.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 owed = uint256(uint128(-amount));
        POOL_MANAGER.sync(currency);
        if (!token.transfer(address(POOL_MANAGER), owed)) revert TokenTransferFailed();
        // The amount settled is checked by PoolManager itself (the unlock reverts if deltas are not zero).
        // forge-lint: disable-next-line(unused-return)
        POOL_MANAGER.settle();
    }
}
