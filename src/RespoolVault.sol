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
/// @notice Holds Respool's Uniswap v4 liquidity on one chain (a balanced base position plus a one-sided
///         limit position for leftover tokens) and acts on callbacks from
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

    /// Position salts: the balanced base position and the one-sided limit position.
    bytes32 internal constant BASE = bytes32(0);
    bytes32 internal constant LIMIT = bytes32(uint256(1));
    /// Balances at or below this are dust and are not worth a position.
    uint256 internal constant DUST = 1e6;

    PoolKey internal _key;

    /// Base position: both tokens, centred on the price when it was opened. Its range is what the brain
    /// watches (`tickLower` / `tickUpper`).
    int24 public tickLower;
    int24 public tickUpper;
    uint128 public liquidity;

    /// Limit position: the token the base position could not use, parked just above the price (token0) or
    /// just below it (token1). When price comes back, traders convert it into the scarce token, so the next
    /// re-centre has both tokens again instead of draining.
    int24 public limitLower;
    int24 public limitUpper;
    uint128 public limitLiquidity;

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

    /// @notice Base plus limit liquidity. This is what the events report as `liquidity`.
    function totalLiquidity() public view returns (uint128) {
        return liquidity + limitLiquidity;
    }

    // ------------------------------------------------------------------ callbacks (from Reactive)

    /// @notice Re-centre on the live tick. `observedTick` is what the brain saw; the vault reads the live
    ///         price itself and skips if the base position is already in range.
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
        emit Recentred(seq, tick, tickLower, tickUpper, totalLiquidity(), trigger);
    }

    /// @notice Pull `shareBps` of both positions out and burn it so it can arrive on `dstChainId`.
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
        if (totalLiquidity() > 0) {
            (amount0, amount1) = abi.decode(_unlock(Action.RemoveShare, shareBps), (uint256, uint256));
            if (amount0 > 0) TOKEN0.burn(amount0);
            if (amount1 > 0) TOKEN1.burn(amount1);
        }
        emit Departed(moveId, dstChainId, amount0, amount1, tickLower, tickUpper, totalLiquidity(), trigger);
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
        emit Arrived(moveId, amount0, amount1, tickLower, tickUpper, totalLiquidity(), trigger);
    }

    // ------------------------------------------------------------------ owner

    /// @notice Seed the vault with test tokens and open its positions around the live tick.
    function bootstrap(uint256 amount0, uint256 amount1) external onlyOwner {
        if (amount0 > 0) TOKEN0.mint(address(this), amount0);
        if (amount1 > 0) TOKEN1.mint(address(this), amount1);
        _unlock(Action.Reposition, 0);
        (, int24 tick,,) = POOL_MANAGER.getSlot0(POOL_ID);
        emit Recentred(0, tick, tickLower, tickUpper, totalLiquidity(), bytes32(0));
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
            // arg is the share in basis points; take the same share of each position.
            uint256 a0 = 0;
            uint256 a1 = 0;
            // Casting is safe: x * bps / 10_000 <= x for bps <= 10_000.
            // forge-lint: disable-next-line(unsafe-typecast)
            uint128 fromBase = uint128((uint256(liquidity) * arg) / 10_000);
            // forge-lint: disable-next-line(unsafe-typecast)
            uint128 fromLimit = uint128((uint256(limitLiquidity) * arg) / 10_000);
            if (fromBase > 0) {
                (a0, a1) = _modify(tickLower, tickUpper, -int256(uint256(fromBase)), BASE);
                // Reported by the caller in the Departed event.
                // forge-lint: disable-next-line(missing-events-arithmetic)
                liquidity -= fromBase;
            }
            if (fromLimit > 0) {
                (uint256 b0, uint256 b1) = _modify(limitLower, limitUpper, -int256(uint256(fromLimit)), LIMIT);
                // forge-lint: disable-next-line(missing-events-arithmetic)
                limitLiquidity -= fromLimit;
                a0 += b0;
                a1 += b1;
            }
            return abi.encode(a0, a1);
        }

        // Reposition: close both positions, then reopen with every token the vault holds.
        if (liquidity > 0) {
            _modify(tickLower, tickUpper, -int256(uint256(liquidity)), BASE);
            liquidity = 0;
        }
        if (limitLiquidity > 0) {
            _modify(limitLower, limitUpper, -int256(uint256(limitLiquidity)), LIMIT);
            limitLiquidity = 0;
        }
        (uint160 sqrtP, int24 tick,,) = POOL_MANAGER.getSlot0(POOL_ID);
        _openBase(sqrtP, tick);
        _openLimit(tick);
        return "";
    }

    /// Balanced position centred on the live tick, as large as the scarcer token allows.
    function _openBase(uint160 sqrtP, int24 tick) internal {
        (int24 lo, int24 hi) = RespoolPolicy.centredRange(tick, TICK_SPACING, HALF_WIDTH);
        (lo, hi) = _clamp(lo, hi);
        tickLower = lo;
        tickUpper = hi;
        (uint256 b0, uint256 b1) = _spendable();
        uint128 l = RespoolLiquidity.forAmounts(
            sqrtP, TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), b0, b1
        );
        if (l == 0) return;
        _modify(lo, hi, int256(uint256(l)), BASE);
        liquidity = l;
    }

    /// One-sided position for the leftover token: token0 in a range just above the price (it is sold as price
    /// rises into it), token1 in a range just below (sold as price falls into it).
    function _openLimit(int24 tick) internal {
        (uint256 b0, uint256 b1) = _spendable();
        int24 width = (2 * HALF_WIDTH + 1) * TICK_SPACING;
        int24 edge = RespoolPolicy.floorToSpacing(tick, TICK_SPACING);
        int24 lo = 0;
        int24 hi = 0;
        uint256 l = 0;
        if (b0 > DUST && b0 >= b1) {
            (lo, hi) = _clamp(edge + TICK_SPACING, edge + TICK_SPACING + width); // lo > tick: token0 only
            if (lo >= hi) return;
            l = RespoolLiquidity.forAmount0(
                TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), b0
            );
        } else if (b1 > DUST) {
            (lo, hi) = _clamp(edge - width, edge); // hi <= tick: token1 only
            if (lo >= hi) return;
            l = RespoolLiquidity.forAmount1(
                TickMath.getSqrtPriceAtTick(lo), TickMath.getSqrtPriceAtTick(hi), b1
            );
        }
        if (l == 0 || l > type(uint128).max) return;
        limitLower = lo;
        limitUpper = hi;
        // Casting is safe: l <= type(uint128).max, checked above.
        // forge-lint: disable-next-line(unsafe-typecast)
        _modify(lo, hi, int256(l), LIMIT);
        // Casting is safe: checked against type(uint128).max above.
        // forge-lint: disable-next-line(unsafe-typecast)
        limitLiquidity = uint128(l);
    }

    /// Token balances minus 2 wei each: v4 rounds amounts owed up, our liquidity maths rounds down.
    function _spendable() internal view returns (uint256 b0, uint256 b1) {
        b0 = TOKEN0.balanceOf(address(this));
        b1 = TOKEN1.balanceOf(address(this));
        b0 = b0 > 2 ? b0 - 2 : 0;
        b1 = b1 > 2 ? b1 - 2 : 0;
    }

    function _clamp(int24 lo, int24 hi) internal view returns (int24, int24) {
        int24 minTick = TickMath.minUsableTick(TICK_SPACING);
        int24 maxTick = TickMath.maxUsableTick(TICK_SPACING);
        if (lo < minTick) lo = minTick;
        if (hi > maxTick) hi = maxTick;
        return (lo, hi);
    }

    /// Add or remove liquidity and settle the result: tokens owed are paid, tokens due are taken.
    /// @return out0 token0 received by the vault
    /// @return out1 token1 received by the vault
    function _modify(int24 lo, int24 hi, int256 delta, bytes32 salt)
        internal
        returns (uint256 out0, uint256 out1)
    {
        // feesAccrued is already included in the caller delta, so it is not needed separately.
        // forge-lint: disable-start(unused-return)
        (BalanceDelta d,) = POOL_MANAGER.modifyLiquidity(
            _key, ModifyLiquidityParams({tickLower: lo, tickUpper: hi, liquidityDelta: delta, salt: salt}), ""
        );
        // forge-lint: disable-end(unused-return)
        out0 = _settle(_key.currency0, TOKEN0, d.amount0());
        out1 = _settle(_key.currency1, TOKEN1, d.amount1());
    }

    function _settle(Currency currency, RespoolToken token, int128 amount) internal returns (uint256 taken) {
        if (amount > 0) {
            // Casting is safe: amount is positive.
            // forge-lint: disable-next-line(unsafe-typecast)
            taken = uint256(uint128(amount));
            POOL_MANAGER.take(currency, address(this), taken);
            return taken;
        }
        if (amount == 0) return 0;
        // Casting is safe: amount is negative and not type(int128).min for any realistic position.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 owed = uint256(uint128(-amount));
        POOL_MANAGER.sync(currency);
        if (!token.transfer(address(POOL_MANAGER), owed)) revert TokenTransferFailed();
        // The amount settled is checked by PoolManager itself (the unlock reverts if deltas are not zero).
        // forge-lint: disable-next-line(unused-return)
        POOL_MANAGER.settle();
        return 0;
    }
}
