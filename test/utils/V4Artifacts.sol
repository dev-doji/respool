// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// PoolManager pins solc 0.8.26, while Respool needs >= 0.8.29. Importing it here makes Foundry compile
// a PoolManager artifact with 0.8.26, which tests then deploy with `deployCode("PoolManager.sol:PoolManager")`.
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
