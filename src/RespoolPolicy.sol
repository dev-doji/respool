// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/// @title RespoolPolicy
/// @notice Pure decision rules used by RespoolBrain. Kept separate so they can be unit-tested without
///         the Reactive system contract or a Uniswap v4 PoolManager.
library RespoolPolicy {
    error InvalidSpacing();
    error InvalidWidth();

    /// @notice True when `tick` is outside the half-open range [lower, upper).
    function outOfRange(int24 tick, int24 lower, int24 upper) internal pure returns (bool) {
        return tick < lower || tick >= upper;
    }

    /// @notice Rounds `tick` down to a multiple of `spacing` (towards negative infinity).
    function floorToSpacing(int24 tick, int24 spacing) internal pure returns (int24) {
        if (spacing <= 0) revert InvalidSpacing();
        int24 q = tick / spacing;
        if (tick < 0 && tick % spacing != 0) q -= 1;
        // Dividing first is the point: it snaps the tick down to a multiple of spacing.
        // forge-lint: disable-next-line(divide-before-multiply)
        return q * spacing;
    }

    /// @notice A range of `2 * halfWidth` spacings centred on the spacing bucket that contains `tick`.
    /// @dev The caller must keep the result inside v4's MIN_TICK / MAX_TICK.
    function centredRange(int24 tick, int24 spacing, int24 halfWidth)
        internal
        pure
        returns (int24 lower, int24 upper)
    {
        if (halfWidth <= 0) revert InvalidWidth();
        int24 base = floorToSpacing(tick, spacing);
        lower = base - halfWidth * spacing;
        upper = base + (halfWidth + 1) * spacing;
    }

    /// @notice Absolute value of a v4 swap delta as an unsigned amount.
    function absAmount(int128 amount) internal pure returns (uint256) {
        // Casting is safe: both operands are non-negative int128 values, which fit in uint128.
        // `-(amount + 1)` avoids overflow when amount == type(int128).min.
        // forge-lint: disable-next-line(unsafe-typecast)
        if (amount >= 0) return uint256(uint128(amount));
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(uint128(-(amount + 1))) + 1;
    }

    /// @notice Exponentially weighted moving average in integer maths.
    /// @param prev Previous score.
    /// @param sample New observation.
    /// @param alphaBps Weight of the new sample, in basis points (0..10_000).
    function ewma(uint256 prev, uint256 sample, uint16 alphaBps) internal pure returns (uint256) {
        if (alphaBps > 10_000) alphaBps = 10_000;
        return (prev * (10_000 - alphaBps) + sample * alphaBps) / 10_000;
    }

    /// @notice Whether liquidity should move from the cold chain to the hot chain.
    /// @param hotDemand Demand score on the candidate destination.
    /// @param coldDemand Demand score on the candidate source.
    /// @param ratioBps Hot must be at least `ratioBps / 10_000` times cold (e.g. 20_000 = 2x).
    /// @param minHotDemand Ignore noise below this score.
    /// @param moveInFlight A previous move has not arrived yet.
    /// @param blocksSinceLastMove Lasna blocks since the last move started.
    /// @param cooldownBlocks Minimum gap between moves.
    function shouldMove(
        uint256 hotDemand,
        uint256 coldDemand,
        uint32 ratioBps,
        uint256 minHotDemand,
        bool moveInFlight,
        uint256 blocksSinceLastMove,
        uint256 cooldownBlocks
    ) internal pure returns (bool) {
        if (moveInFlight) return false;
        if (blocksSinceLastMove < cooldownBlocks) return false;
        if (hotDemand < minHotDemand) return false;
        return hotDemand * 10_000 >= coldDemand * uint256(ratioBps);
    }
}
