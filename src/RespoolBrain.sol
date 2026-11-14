// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {AbstractReactive} from "@reactive/src/base/AbstractReactive.sol";
import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

import {RespoolPolicy} from "./RespoolPolicy.sol";
import {RespoolVault} from "./RespoolVault.sol";

/// @title RespoolBrain
/// @notice Reactive contract on Reactive Network. Watches the Respool pool's Uniswap v4 `Swap` events and
///         the vault events on two chains, and requests callbacks to the vaults:
///         - `recentre` on a chain whose price left the vault's range,
///         - `depart` on the quiet chain when the busy chain's demand is `ratioBps` times higher,
///         - `arrive` on the busy chain once the matching `Departed` event is seen.
/// @dev The brain only knows what vaults and pools emit. Every callback carries the origin tx hash as
///      `trigger` so the full loop can be timed (origin event -> this react tx -> callback tx).
contract RespoolBrain is AbstractReactive {
    error NotOwner();
    error TooManyChains();
    error UnknownChain();

    struct Chain {
        address poolManager;
        bytes32 poolId;
        address vault;
        int24 lastTick;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        bool hasRange;
        uint256 demand; // recent swap count (1e18 per swap), decayed by Reactive blocks elapsed
        uint256 demandBlock; // block at which `demand` was last brought up to date
        uint64 recentreSeq;
        bool recentrePending;
        uint256 recentreRequestedAt;
    }

    struct Params {
        uint32 demandHalfLifeBlocks; // demand halves after this many Reactive blocks without new swaps
        uint32 ratioBps; // hot/cold demand ratio that triggers a move (30_000 = 3x)
        uint256 minHotDemand; // ignore demand below this (1e18 = one recent swap)
        uint256 cooldownBlocks; // Reactive blocks between moves
        uint256 pendingTimeoutBlocks; // re-allow a recentre if the last one never reported back
        uint16 shareBps; // share of the cold position to move
        uint64 recentreGas;
        uint64 departGas;
        uint64 arriveGas;
    }

    event ChainConfigured(uint256 indexed chainId, address poolManager, bytes32 poolId, address vault);
    event RecentreRequested(uint256 indexed chainId, uint64 indexed seq, int24 tick, bytes32 trigger);
    event MoveRequested(
        uint64 indexed moveId,
        uint256 srcChainId,
        uint256 dstChainId,
        uint256 hotDemand,
        uint256 coldDemand,
        bytes32 trigger
    );
    event ArriveRequested(
        uint64 indexed moveId, uint256 dstChainId, uint256 amount0, uint256 amount1, bytes32 trigger
    );
    event MoveCompleted(uint64 indexed moveId, bytes32 trigger);

    uint256 internal immutable SWAP_TOPIC = uint256(IPoolManager.Swap.selector);
    uint256 internal immutable RECENTRED_TOPIC = uint256(RespoolVault.Recentred.selector);
    uint256 internal immutable DEPARTED_TOPIC = uint256(RespoolVault.Departed.selector);
    uint256 internal immutable ARRIVED_TOPIC = uint256(RespoolVault.Arrived.selector);
    /// Demand added per swap. `minHotDemand` is in the same unit (2e18 = about two recent swaps).
    uint256 internal constant SWAP_UNIT = 1e18;

    uint256 internal immutable SKIPPED_TOPIC = uint256(RespoolVault.CallbackSkipped.selector);

    address public immutable owner;
    Params public params;

    uint256[] public chainIds;
    mapping(uint256 => Chain) internal chains;

    uint64 public lastMoveId;
    uint64 public inFlightMove;
    uint256 public moveSrc;
    uint256 public moveDst;
    uint256 public lastMoveBlock;
    bool public arriveRequested;
    uint256 public arriveAmount0;
    uint256 public arriveAmount1;

    constructor(Params memory params_) payable {
        owner = msg.sender;
        params = params_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ------------------------------------------------------------------ setup

    /// @notice Register one chain's pool and vault and subscribe to their events. At most two chains.
    function configureChain(uint256 chainId, address poolManager, bytes32 poolId, address vault)
        external
        onlyOwner
    {
        if (chains[chainId].vault == address(0)) {
            if (chainIds.length == 2) revert TooManyChains();
            chainIds.push(chainId);
        }
        Chain storage c = chains[chainId];
        c.poolManager = poolManager;
        c.poolId = poolId;
        c.vault = vault;

        SYSTEM.subscribe(chainId, poolManager, SWAP_TOPIC, uint256(poolId), REACTIVE_IGNORE, REACTIVE_IGNORE);
        SYSTEM.subscribe(chainId, vault, RECENTRED_TOPIC, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        SYSTEM.subscribe(chainId, vault, DEPARTED_TOPIC, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        SYSTEM.subscribe(chainId, vault, ARRIVED_TOPIC, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        SYSTEM.subscribe(chainId, vault, SKIPPED_TOPIC, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        emit ChainConfigured(chainId, poolManager, poolId, vault);
    }

    function setParams(Params calldata params_) external onlyOwner {
        params = params_;
    }

    /// @notice Re-send `arrive` for the in-flight move if its first callback failed (e.g. out of funds).
    ///         Safe to repeat: the vault ignores a moveId it has already handled.
    function retryArrive() external onlyOwner {
        if (inFlightMove != 0 && arriveRequested) {
            _requestArrive(inFlightMove, arriveAmount0, arriveAmount1, bytes32(0));
        }
    }

    function coverDebt() external {
        _coverDebt();
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        _pay(to, amount);
    }

    function chainCount() external view returns (uint256) {
        return chainIds.length;
    }

    /// @notice Everything the brain knows about one chain.
    function chain(uint256 chainId) external view returns (Chain memory) {
        return chains[chainId];
    }

    // ------------------------------------------------------------------ react

    function react(LogRecord calldata log) external onlySystem {
        Chain storage c = chains[log.chainId];
        if (c.vault == address(0)) return;
        bytes32 trigger = bytes32(log.txHash);

        if (log.topic0 == SWAP_TOPIC) {
            if (log.contractAddress == c.poolManager && bytes32(log.topic1) == c.poolId) {
                _onSwap(log.chainId, c, log.data, trigger);
            }
            return;
        }
        if (log.contractAddress != c.vault) return;

        if (log.topic0 == RECENTRED_TOPIC) {
            (, int24 lo, int24 hi, uint128 liq,) =
                abi.decode(log.data, (int24, int24, int24, uint128, bytes32));
            _setRange(c, lo, hi, liq);
            c.recentrePending = false;
        } else if (log.topic0 == SKIPPED_TOPIC) {
            (uint8 reason,) = abi.decode(log.data, (uint8, bytes32));
            if (reason != 3) c.recentrePending = false; // 1 = stale seq, 2 = already in range
        } else if (log.topic0 == DEPARTED_TOPIC) {
            (, uint256 a0, uint256 a1, int24 lo, int24 hi, uint128 liq,) =
                abi.decode(log.data, (uint256, uint256, uint256, int24, int24, uint128, bytes32));
            _setRange(c, lo, hi, liq);
            // Casting is safe: moveIds are uint64 and the vault indexes them as uint64.
            // forge-lint: disable-next-line(unsafe-typecast)
            uint64 moveId = uint64(log.topic1);
            if (moveId == inFlightMove && log.chainId == moveSrc && !arriveRequested) {
                arriveRequested = true;
                arriveAmount0 = a0;
                arriveAmount1 = a1;
                _requestArrive(moveId, a0, a1, trigger);
            }
        } else if (log.topic0 == ARRIVED_TOPIC) {
            (,, int24 lo, int24 hi, uint128 liq,) =
                abi.decode(log.data, (uint256, uint256, int24, int24, uint128, bytes32));
            _setRange(c, lo, hi, liq);
            // forge-lint: disable-next-line(unsafe-typecast)
            uint64 moveId = uint64(log.topic1);
            if (moveId == inFlightMove && log.chainId == moveDst) {
                inFlightMove = 0;
                arriveRequested = false;
                emit MoveCompleted(moveId, trigger);
            }
        }
    }

    function _onSwap(uint256 chainId, Chain storage c, bytes calldata data, bytes32 trigger) internal {
        (,,,, int24 tick,) = abi.decode(data, (int128, int128, uint160, uint128, int24, uint24));
        c.lastTick = tick;

        // Demand is recent swap ACTIVITY (each swap counts as one unit) that fades with time. Volume is not used:
        // a price-limited swap trades whatever liquidity sits in its path, so volume measures the pool's own depth
        // and made the rule chase its own liquidity (seen live). Both chains decay by the same elapsed time, so
        // balanced trading keeps them level and only a real shift in activity tips the ratio.
        uint256 otherId = _other(chainId);
        _decayDemand(c);
        c.demand += SWAP_UNIT;
        if (otherId != 0) _decayDemand(chains[otherId]);

        _maybeRecentre(chainId, c, tick, trigger);
        if (otherId != 0) _maybeMove(chainId, c, otherId, chains[otherId], trigger);
    }

    /// Rule 1: re-centre a position the price has left (once, until the vault reports back or it times out).
    function _maybeRecentre(uint256 chainId, Chain storage c, int24 tick, bytes32 trigger) internal {
        if (!c.hasRange || c.liquidity == 0) return;
        if (!RespoolPolicy.outOfRange(tick, c.tickLower, c.tickUpper)) return;
        bool stale = block.number >= c.recentreRequestedAt + params.pendingTimeoutBlocks;
        if (c.recentrePending && !stale) return;

        c.recentrePending = true;
        c.recentreRequestedAt = block.number;
        uint64 seq = ++c.recentreSeq;
        _request(
            chainId,
            c.vault,
            params.recentreGas,
            abi.encodeCall(RespoolVault.recentre, (address(0), seq, tick, trigger))
        );
        emit RecentreRequested(chainId, seq, tick, trigger);
    }

    /// Rule 2: move part of the quiet chain's position to the busy chain `hotId`.
    function _maybeMove(uint256 hotId, Chain storage hot, uint256 coldId, Chain storage cold, bytes32 trigger)
        internal
    {
        if (cold.liquidity == 0) return;
        bool go = RespoolPolicy.shouldMove(
            hot.demand,
            cold.demand,
            params.ratioBps,
            params.minHotDemand,
            inFlightMove != 0,
            lastMoveId == 0 ? type(uint256).max : block.number - lastMoveBlock,
            params.cooldownBlocks
        );
        if (!go) return;

        uint64 moveId = ++lastMoveId;
        inFlightMove = moveId;
        moveSrc = coldId;
        moveDst = hotId;
        lastMoveBlock = block.number;
        arriveRequested = false;
        _request(
            coldId,
            cold.vault,
            params.departGas,
            abi.encodeCall(RespoolVault.depart, (address(0), moveId, params.shareBps, hotId, trigger))
        );
        emit MoveRequested(moveId, coldId, hotId, hot.demand, cold.demand, trigger);
    }

    function _decayDemand(Chain storage c) internal {
        c.demand = RespoolPolicy.decay(c.demand, block.number - c.demandBlock, params.demandHalfLifeBlocks);
        c.demandBlock = block.number;
    }

    function _requestArrive(uint64 moveId, uint256 a0, uint256 a1, bytes32 trigger) internal {
        Chain storage d = chains[moveDst];
        _request(
            moveDst,
            d.vault,
            params.arriveGas,
            abi.encodeCall(RespoolVault.arrive, (address(0), moveId, a0, a1, trigger))
        );
        emit ArriveRequested(moveId, moveDst, a0, a1, trigger);
    }

    function _request(uint256 chainId, address recipient, uint64 gasLimit, bytes memory payload) internal {
        SYSTEM.requestCallbackV_1_0(
            ISystemContract.CallbackConfiguration_V_1_0({
                chainId: chainId, recipient: recipient, gasLimit: gasLimit, payload: payload
            })
        );
    }

    function _setRange(Chain storage c, int24 lo, int24 hi, uint128 liq) internal {
        c.tickLower = lo;
        c.tickUpper = hi;
        c.liquidity = liq;
        c.hasRange = true;
    }

    function _other(uint256 chainId) internal view returns (uint256) {
        if (chainIds.length < 2) return 0;
        return chainIds[0] == chainId ? chainIds[1] : chainIds[0];
    }
}
