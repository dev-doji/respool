// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";

/// @title RespoolLiquidity
/// @notice Liquidity for token amounts in a concentrated range (standard Uniswap formulas, rounded down).
library RespoolLiquidity {
    uint256 internal constant Q96 = 0x1000000000000000000000000;

    function forAmount0(uint160 sqrtA, uint160 sqrtB, uint256 amount0) internal pure returns (uint256) {
        if (sqrtA > sqrtB) (sqrtA, sqrtB) = (sqrtB, sqrtA);
        uint256 intermediate = FullMath.mulDiv(sqrtA, sqrtB, Q96);
        return FullMath.mulDiv(amount0, intermediate, sqrtB - sqrtA);
    }

    function forAmount1(uint160 sqrtA, uint160 sqrtB, uint256 amount1) internal pure returns (uint256) {
        if (sqrtA > sqrtB) (sqrtA, sqrtB) = (sqrtB, sqrtA);
        return FullMath.mulDiv(amount1, Q96, sqrtB - sqrtA);
    }

    /// @notice Largest liquidity the amounts can fund at price `sqrtP` in range [sqrtA, sqrtB].
    function forAmounts(uint160 sqrtP, uint160 sqrtA, uint160 sqrtB, uint256 amount0, uint256 amount1)
        internal
        pure
        returns (uint128)
    {
        if (sqrtA > sqrtB) (sqrtA, sqrtB) = (sqrtB, sqrtA);
        uint256 l;
        if (sqrtP <= sqrtA) {
            l = forAmount0(sqrtA, sqrtB, amount0);
        } else if (sqrtP < sqrtB) {
            uint256 l0 = forAmount0(sqrtP, sqrtB, amount0);
            uint256 l1 = forAmount1(sqrtA, sqrtP, amount1);
            l = l0 < l1 ? l0 : l1;
        } else {
            l = forAmount1(sqrtA, sqrtB, amount1);
        }
        // Casting is safe: the value is capped at type(uint128).max first.
        // forge-lint: disable-next-line(unsafe-typecast)
        return l > type(uint128).max ? type(uint128).max : uint128(l);
    }
}
