// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";

/// @notice TEST DOUBLE for the Reactive Network system contract. Tests etch it at
///         0x8888888888888888888888888888888888888888. It records subscriptions and callback requests;
///         it does not deliver anything by itself.
contract MockSystem {
    struct Sub {
        address subscriber;
        uint256 chainId;
        address contract_;
        uint256 topic0;
        uint256 topic1;
        uint256 topic2;
        uint256 topic3;
    }

    Sub[] internal _subs;
    ISystemContract.CallbackConfiguration_V_1_0[] internal _callbacks;
    uint256 public delivered;

    receive() external payable {}

    function debt(address) external pure returns (uint256) {
        return 0;
    }

    function subscribe(uint256 chainId, address c, uint256 t0, uint256 t1, uint256 t2, uint256 t3) external {
        _subs.push(Sub(msg.sender, chainId, c, t0, t1, t2, t3));
    }

    function unsubscribe(uint256, address, uint256, uint256, uint256, uint256) external {}

    function requestCallbackV_1_0(ISystemContract.CallbackConfiguration_V_1_0 memory config) external {
        _callbacks.push(config);
    }

    function subCount() external view returns (uint256) {
        return _subs.length;
    }

    function sub(uint256 i) external view returns (Sub memory) {
        return _subs[i];
    }

    function callbackCount() external view returns (uint256) {
        return _callbacks.length;
    }

    function callback(uint256 i) external view returns (ISystemContract.CallbackConfiguration_V_1_0 memory) {
        return _callbacks[i];
    }

    /// Callbacks not yet handed to the test's relay.
    function pending() external view returns (uint256) {
        return _callbacks.length - delivered;
    }

    function markDelivered() external returns (ISystemContract.CallbackConfiguration_V_1_0 memory c) {
        c = _callbacks[delivered];
        delivered++;
    }
}
