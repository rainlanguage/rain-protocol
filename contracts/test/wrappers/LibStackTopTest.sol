// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../vm/runtime/LibStackTop.sol";
import "../../debug/LibDebug.sol";

/// @title LibStackTopTest
/// Test wrapper around `LibStackTop` library.
/// This contract DOES NOT simply expose library functions.
/// Liberties have been made to make these functions testable, such as
/// converting inputs to StackTop type, or adding `up(n_)` shift functionality
/// to functions so we can test in cases where a function is called when stack
/// top is not at the bottom of the stack.
contract LibStackTopTest {
    using LibStackTop for bytes;
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;
    using LibStackTop for uint256;

    /// peekUp returning value above stack top

    function peekUp(bytes memory bytes_) external returns (uint256 a_) {
        LibDebug.dumpMemory();
        a_ = bytes_.asStackTop().peekUp();
        LibDebug.dumpMemory();
    }

    function peekUp(bytes memory bytes_, uint256 n_)
        external
        returns (uint256 a_)
    {
        LibDebug.dumpMemory();
        a_ = bytes_.asStackTop().up(n_).peekUp();
        LibDebug.dumpMemory();
    }

    function peekUp(uint256[] memory array_) external returns (uint256 a_) {
        LibDebug.dumpMemory();
        a_ = array_.asStackTop().peekUp();
        LibDebug.dumpMemory();
    }

    function peekUp(uint256[] memory array_, uint256 n_)
        external
        returns (uint256 a_)
    {
        LibDebug.dumpMemory();
        a_ = array_.asStackTop().up(n_).peekUp();
        LibDebug.dumpMemory();
    }

    /// peekUp returning original stack top

    function peekUpStackTop(bytes memory bytes_) external returns (StackTop) {
        LibDebug.dumpMemory();
        bytes_.asStackTop().peekUp();
        LibDebug.dumpMemory();
        return bytes_.asStackTop();
    }

    function peekUpStackTop(bytes memory bytes_, uint256 n_)
        external
        returns (StackTop)
    {
        LibDebug.dumpMemory();
        bytes_.asStackTop().up(n_).peekUp();
        LibDebug.dumpMemory();
        return bytes_.asStackTop();
    }

    function peekUpStackTop(uint256[] memory array_)
        external
        returns (StackTop)
    {
        LibDebug.dumpMemory();
        array_.asStackTop().peekUp();
        LibDebug.dumpMemory();
        return array_.asStackTop();
    }

    function peekUpStackTop(uint256[] memory array_, uint256 n_)
        external
        returns (StackTop)
    {
        LibDebug.dumpMemory();
        array_.asStackTop().up(n_).peekUp();
        LibDebug.dumpMemory();
        return array_.asStackTop();
    }

    function peek(bytes memory bytes_) external returns (uint256 a_) {
        LibDebug.dumpMemory();
        a_ = bytes_.asStackTop().peek();
        LibDebug.dumpMemory();
    }

    function peek(bytes memory bytes_, uint256 n_)
        external
        returns (uint256 a_)
    {
        LibDebug.dumpMemory();
        a_ = bytes_.asStackTop().up(n_).peek();
        LibDebug.dumpMemory();
    }

    function peek(uint256[] memory array_) external returns (uint256 a_) {
        LibDebug.dumpMemory();
        a_ = array_.asStackTop().peek();
        LibDebug.dumpMemory();
    }

    function peek(uint256[] memory array_, uint256 n_)
        external
        returns (uint256 a_)
    {
        LibDebug.dumpMemory();
        a_ = array_.asStackTop().up(n_).peek();
        LibDebug.dumpMemory();
    }

    function peek2(bytes memory bytes_, uint256 n_)
        external
        returns (uint256 a_, uint256 b_)
    {
        LibDebug.dumpMemory();
        (a_, b_) = bytes_.asStackTop().up(n_).peek2();
        LibDebug.dumpMemory();
    }

    function peek2(uint256[] memory array_, uint256 n_)
        external
        returns (uint256 a_, uint256 b_)
    {
        LibDebug.dumpMemory();
        (a_, b_) = array_.asStackTop().up(n_).peek2();
        LibDebug.dumpMemory();
    }

    function pop(bytes memory bytes_, uint256 n_)
        external
        returns (StackTop stackTopAfter_, uint256 a_)
    {
        LibDebug.dumpMemory();
        (stackTopAfter_, a_) = bytes_.asStackTop().up(n_).pop();
        LibDebug.dumpMemory();
    }

    function pop(uint256[] memory array_, uint256 n_)
        external
        returns (StackTop stackTopAfter_, uint256 a_)
    {
        LibDebug.dumpMemory();
        (stackTopAfter_, a_) = array_.asStackTop().up(n_).pop();
        LibDebug.dumpMemory();
    }

    function set(
        bytes memory bytes_,
        uint256 a_,
        uint256 n_
    ) external returns (StackTop) {
        LibDebug.dumpMemory();
        bytes_.asStackTop().up(n_).set(a_);
        LibDebug.dumpMemory();
        return bytes_.asStackTop();
    }

    function set(
        uint256[] memory array_,
        uint256 a_,
        uint256 n_
    ) external returns (StackTop) {
        LibDebug.dumpMemory();
        array_.asStackTop().up(n_).set(a_);
        LibDebug.dumpMemory();
        return array_.asStackTop();
    }

    function push(uint256[] memory array_, uint256 a_)
        external
        returns (StackTop stackTop_)
    {
        LibDebug.dumpMemory();
        stackTop_ = array_.asStackTop().push(a_);
        LibDebug.dumpMemory();
    }

    function push(uint256[] memory array_, uint256[] memory pushArray_)
        external
        returns (StackTop stackTop_)
    {
        LibDebug.dumpMemory();
        stackTop_ = array_.asStackTop().push(pushArray_);
        LibDebug.dumpMemory();
    }

    function pushWithLength(
        uint256[] memory array_,
        uint256[] memory pushArray_
    ) external returns (StackTop stackTop_) {
        LibDebug.dumpMemory();
        stackTop_ = array_.asStackTop().pushWithLength(pushArray_);
        LibDebug.dumpMemory();
    }

    function unalignedPush(bytes memory bytes0_, bytes memory bytes1_)
        external
        returns (StackTop stackTop_)
    {
        LibDebug.dumpMemory();
        stackTop_ = bytes0_.asStackTop().unalignedPush(bytes1_);
        LibDebug.dumpMemory();
    }

    function unalignedPushWithLength(bytes memory bytes0_, bytes memory bytes1_)
        external
        returns (StackTop stackTop_)
    {
        LibDebug.dumpMemory();
        stackTop_ = bytes0_.asStackTop().unalignedPushWithLength(bytes1_);
        LibDebug.dumpMemory();
    }

    function asStackTop(bytes memory bytes_)
        external
        returns (StackTop stackTop_)
    {
        LibDebug.dumpMemory();
        stackTop_ = bytes_.asStackTop();
        LibDebug.dumpMemory();
    }

    function asStackTopAsBytes(bytes memory bytes_)
        external
        returns (bytes memory bytes0_)
    {
        StackTop stackTop_ = bytes_.asStackTop();
        LibDebug.dumpMemory();
        bytes0_ = stackTop_.asBytes();
        LibDebug.dumpMemory();
        return bytes0_;
    }
}
