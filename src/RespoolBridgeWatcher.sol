// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {AbstractReactive} from "@reactive/src/base/AbstractReactive.sol";

/// @title RespoolBridgeWatcher
/// @notice Reactive contract on Reactive Network that watches the Across bridge on two chains. It sees each
///         `FundsDeposited` on the origin SpokePool and the matching `FilledRelay` on the destination SpokePool,
///         and records how long the transfer took *as Reactive observed it*, plus running statistics.
/// @dev Times are Reactive's own `block.timestamp` when each event was processed, in whole seconds. They include
///      Reactive's observation delay on both sides, so they are a close proxy for the bridge time, not the chains'
///      block-clock difference. If Reactive happens to process a fill before its deposit, that transfer is not timed.
///      The contract only observes: it holds no user funds and calls nothing on any chain.
contract RespoolBridgeWatcher is AbstractReactive {
    error NotOwner();

    /// event FundsDeposited(...indexed destinationChainId, indexed depositId, indexed depositor). Topics: [sig, dest, id, depositor].
    uint256 internal constant FUNDS_DEPOSITED = 0x32ed1a409ef04c7b0227189c3a103dc5ac10e775a15b785dcc510201f7c25ad3;
    /// event FilledRelay(... indexed originChainId, indexed depositId, indexed relayer ...). Topics: [sig, origin, id, relayer].
    uint256 internal constant FILLED_RELAY = 0x44b559f101f8fbcc8a0ea43fa91a05a729a5ea6e14a7c75aa750374690137208;

    struct Transfer {
        uint32 originChainId;
        uint32 destinationChainId;
        uint64 depositSeenAt;
        uint64 fillSeenAt;
        address depositor;
    }

    event TransferSeen(uint256 indexed originChainId, uint256 indexed depositId, uint256 destinationChainId, address depositor, uint256 seenAt);
    event TransferFilled(uint256 indexed originChainId, uint256 indexed depositId, uint256 destinationChainId, uint256 latencySeconds);

    address public immutable owner;

    mapping(bytes32 => Transfer) public transfers;
    uint256 public deposits;
    uint256 public fills;
    uint256 public totalLatency;
    uint256 public minLatency;
    uint256 public maxLatency;
    uint256 public lastLatency;

    constructor() payable {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ------------------------------------------------------------------ setup

    /// @notice Watch every deposit on `spokePool` (the origin side) of `chainId`.
    function watchDeposits(uint256 chainId, address spokePool) external onlyOwner {
        SYSTEM.subscribe(chainId, spokePool, FUNDS_DEPOSITED, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }

    /// @notice Watch every fill on `spokePool` (the destination side) of `chainId`.
    function watchFills(uint256 chainId, address spokePool) external onlyOwner {
        SYSTEM.subscribe(chainId, spokePool, FILLED_RELAY, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }

    function stopWatchingDeposits(uint256 chainId, address spokePool) external onlyOwner {
        SYSTEM.unsubscribe(chainId, spokePool, FUNDS_DEPOSITED, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }

    function stopWatchingFills(uint256 chainId, address spokePool) external onlyOwner {
        SYSTEM.unsubscribe(chainId, spokePool, FILLED_RELAY, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
    }

    function coverDebt() external {
        _coverDebt();
    }

    function withdraw(address payable to, uint256 amount) external onlyOwner {
        _pay(to, amount);
    }

    // ------------------------------------------------------------------ react

    function react(LogRecord calldata log) external onlySystem {
        if (log.topic0 == FUNDS_DEPOSITED) {
            _onDeposit(log);
        } else if (log.topic0 == FILLED_RELAY) {
            _onFill(log);
        }
    }

    function _onDeposit(LogRecord calldata log) internal {
        bytes32 key = keyOf(log.chainId, log.topic2);
        Transfer storage t = transfers[key];
        if (t.depositSeenAt != 0) return; // the same deposit observed twice
        // Casts are safe: chain ids are far below 2^32 and timestamps below 2^64.
        // forge-lint: disable-start(unsafe-typecast)
        t.originChainId = uint32(log.chainId);
        t.destinationChainId = uint32(log.topic1);
        t.depositSeenAt = uint64(block.timestamp);
        // forge-lint: disable-end(unsafe-typecast)
        // The depositor is an address stored in the topic's low 20 bytes.
        // forge-lint: disable-next-line(unsafe-typecast)
        t.depositor = address(uint160(log.topic3));
        deposits++;
        emit TransferSeen(log.chainId, log.topic2, log.topic1, t.depositor, block.timestamp);
    }

    function _onFill(LogRecord calldata log) internal {
        Transfer storage t = transfers[keyOf(log.topic1, log.topic2)];
        // Ignore fills for transfers we did not see leave, fills already counted, and fills reported by the wrong chain.
        if (t.depositSeenAt == 0 || t.fillSeenAt != 0 || log.chainId != t.destinationChainId) return;
        // forge-lint: disable-next-line(unsafe-typecast)
        t.fillSeenAt = uint64(block.timestamp);
        uint256 latency = block.timestamp - t.depositSeenAt;
        if (fills == 0 || latency < minLatency) minLatency = latency;
        if (latency > maxLatency) maxLatency = latency;
        lastLatency = latency;
        totalLatency += latency;
        fills++;
        emit TransferFilled(log.topic1, log.topic2, log.chainId, latency);
    }

    // ------------------------------------------------------------------ views

    /// @notice The key a transfer is stored under: the origin chain and Across's deposit ID on that chain.
    function keyOf(uint256 originChainId, uint256 depositId) public pure returns (bytes32) {
        return keccak256(abi.encode(originChainId, depositId));
    }

    /// @notice Average latency in whole seconds, or 0 before any fill.
    function averageLatency() external view returns (uint256) {
        return fills == 0 ? 0 : totalLatency / fills;
    }
}
