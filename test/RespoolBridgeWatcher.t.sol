// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {IReactive} from "@reactive/src/interfaces/IReactive.sol";
import {AbstractPayer} from "@reactive/src/base/AbstractPayer.sol";
import {RespoolBridgeWatcher} from "../src/RespoolBridgeWatcher.sol";
import {MockSystem} from "./utils/MockSystem.sol";

/// @dev Hand-built logs that follow the layout of the REAL transfer on 2026-11-18 (0.001 ETH, Unichain Sepolia ->
///      Base Sepolia, deposit ID 6100): FundsDeposited topics [sig, destinationChainId, depositId, depositor] on
///      the origin chain, FilledRelay topics [sig, originChainId, depositId, relayer] on the destination chain.
contract RespoolBridgeWatcherTest is Test {
    address constant SYS = 0x8888888888888888888888888888888888888888;
    uint256 constant REACTIVE_IGNORE = 0xa65f96fc951c35ead38878e0f0b7a3c744a6f5ccc1476b313353ce31712313ad;
    uint256 constant FUNDS_DEPOSITED = 0x32ed1a409ef04c7b0227189c3a103dc5ac10e775a15b785dcc510201f7c25ad3;
    uint256 constant FILLED_RELAY = 0x44b559f101f8fbcc8a0ea43fa91a05a729a5ea6e14a7c75aa750374690137208;
    uint256 constant UNICHAIN = 1301;
    uint256 constant BASE = 84532;
    address constant SPOKE_U = 0x6999526e507Cc3b03b180BbE05E1Ff938259A874;
    address constant SPOKE_B = 0x82B564983aE7274c86695917BBf8C99ECb6F0F8F;
    address constant DEPOSITOR = 0x0326DBb448a879704b6a40D74D108485e1f25332;

    MockSystem sys;
    RespoolBridgeWatcher watcher;

    function setUp() public {
        vm.etch(SYS, address(new MockSystem()).code);
        sys = MockSystem(payable(SYS));
        watcher = new RespoolBridgeWatcher();
    }

    function _deposit(uint256 originChain, uint256 destChain, uint256 id) internal {
        IReactive.LogRecord memory r = IReactive.LogRecord({
            chainId: originChain, contractAddress: originChain == UNICHAIN ? SPOKE_U : SPOKE_B, topic0: FUNDS_DEPOSITED,
            topic1: destChain, topic2: id, topic3: uint256(uint160(DEPOSITOR)), data: "", blockNumber: 1, opCode: 4, blockHash: 0, txHash: 1, logIndex: 0
        });
        vm.prank(SYS);
        watcher.react(r);
    }

    function _fill(uint256 destChain, uint256 originChain, uint256 id) internal {
        IReactive.LogRecord memory r = IReactive.LogRecord({
            chainId: destChain, contractAddress: destChain == BASE ? SPOKE_B : SPOKE_U, topic0: FILLED_RELAY,
            topic1: originChain, topic2: id, topic3: uint256(uint160(address(0xBEEF))), data: "", blockNumber: 1, opCode: 4, blockHash: 0, txHash: 2, logIndex: 0
        });
        vm.prank(SYS);
        watcher.react(r);
    }

    function test_watching_subscribesToTheRightEvents() public {
        watcher.watchDeposits(UNICHAIN, SPOKE_U);
        watcher.watchFills(BASE, SPOKE_B);
        assertEq(sys.subCount(), 2);
        MockSystem.Sub memory a = sys.sub(0);
        assertEq(a.subscriber, address(watcher));
        assertEq(a.chainId, UNICHAIN);
        assertEq(a.contract_, SPOKE_U);
        assertEq(a.topic0, FUNDS_DEPOSITED);
        assertEq(a.topic1, REACTIVE_IGNORE);
        MockSystem.Sub memory b = sys.sub(1);
        assertEq(b.chainId, BASE);
        assertEq(b.contract_, SPOKE_B);
        assertEq(b.topic0, FILLED_RELAY);
    }

    function test_setup_isOwnerOnly() public {
        vm.prank(address(0xCAFE));
        vm.expectRevert(RespoolBridgeWatcher.NotOwner.selector);
        watcher.watchDeposits(UNICHAIN, SPOKE_U);
        vm.prank(address(0xCAFE));
        vm.expectRevert(RespoolBridgeWatcher.NotOwner.selector);
        watcher.watchFills(BASE, SPOKE_B);
    }

    function test_react_isSystemOnly() public {
        IReactive.LogRecord memory r;
        vm.expectRevert(abi.encodeWithSelector(AbstractPayer.NotAuthorized.selector, address(this), SYS));
        watcher.react(r);
    }

    function test_depositThenFill_recordsTheLatency() public {
        vm.warp(1_000);
        _deposit(UNICHAIN, BASE, 6100);
        (uint32 origin, uint32 dest, uint64 seen, uint64 filled, address who) = watcher.transfers(watcher.keyOf(UNICHAIN, 6100));
        assertEq(origin, UNICHAIN);
        assertEq(dest, BASE);
        assertEq(seen, 1_000);
        assertEq(filled, 0);
        assertEq(who, DEPOSITOR);
        assertEq(watcher.deposits(), 1);

        vm.warp(1_003);
        vm.expectEmit(true, true, false, true, address(watcher));
        emit RespoolBridgeWatcher.TransferFilled(UNICHAIN, 6100, BASE, 3);
        _fill(BASE, UNICHAIN, 6100);

        (,,, filled,) = watcher.transfers(watcher.keyOf(UNICHAIN, 6100));
        assertEq(filled, 1_003);
        assertEq(watcher.fills(), 1);
        assertEq(watcher.lastLatency(), 3);
        assertEq(watcher.averageLatency(), 3);
        assertEq(watcher.minLatency(), 3);
        assertEq(watcher.maxLatency(), 3);
    }

    function test_statisticsAcrossSeveralTransfers() public {
        vm.warp(100);
        _deposit(UNICHAIN, BASE, 1);
        vm.warp(102);
        _fill(BASE, UNICHAIN, 1); // 2 s
        vm.warp(200);
        _deposit(BASE, UNICHAIN, 2);
        vm.warp(207);
        _fill(UNICHAIN, BASE, 2); // 7 s
        vm.warp(300);
        _deposit(UNICHAIN, BASE, 3);
        vm.warp(304);
        _fill(BASE, UNICHAIN, 3); // 4 s
        assertEq(watcher.deposits(), 3);
        assertEq(watcher.fills(), 3);
        assertEq(watcher.minLatency(), 2);
        assertEq(watcher.maxLatency(), 7);
        assertEq(watcher.lastLatency(), 4);
        assertEq(watcher.averageLatency(), 4); // (2 + 7 + 4) / 3 = 4.33, whole seconds
    }

    function test_duplicateObservationsAreCountedOnce() public {
        vm.warp(10);
        _deposit(UNICHAIN, BASE, 5);
        vm.warp(20);
        _deposit(UNICHAIN, BASE, 5); // same deposit seen again later: the first sighting stays
        (,, uint64 seen,,) = watcher.transfers(watcher.keyOf(UNICHAIN, 5));
        assertEq(seen, 10);
        assertEq(watcher.deposits(), 1);

        vm.warp(14);
        _fill(BASE, UNICHAIN, 5);
        vm.warp(99);
        _fill(BASE, UNICHAIN, 5); // the same fill again
        assertEq(watcher.fills(), 1);
        assertEq(watcher.lastLatency(), 4 - 0); // 14 - 10
    }

    function test_unknownAndMisreportedFillsAreIgnored() public {
        vm.warp(50);
        _fill(BASE, UNICHAIN, 777); // a fill for a deposit we never saw
        assertEq(watcher.fills(), 0);

        _deposit(UNICHAIN, BASE, 8);
        vm.warp(52);
        _fill(UNICHAIN, UNICHAIN, 8); // reported by the wrong chain (the deposit was bound for Base)
        assertEq(watcher.fills(), 0);
        _fill(BASE, UNICHAIN, 8);
        assertEq(watcher.fills(), 1);
    }

    function test_otherEventsAreIgnored() public {
        IReactive.LogRecord memory r = IReactive.LogRecord({
            chainId: UNICHAIN, contractAddress: SPOKE_U, topic0: 0xdead, topic1: 0, topic2: 0, topic3: 0, data: "", blockNumber: 1, opCode: 1, blockHash: 0, txHash: 3, logIndex: 0
        });
        vm.prank(SYS);
        watcher.react(r);
        assertEq(watcher.deposits(), 0);
        assertEq(watcher.fills(), 0);
    }
}
