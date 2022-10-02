// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../vm/runtime/LibStackTop.sol";
import "../../../../debug/LibDebug.sol";
import "../../../../memory/LibMemorySize.sol";

/// @title LibStackTopTest
/// Test wrapper around `LibStackTop` library.
/// This contract DOES NOT simply expose library functions.
/// Liberties have been made to make these functions testable, such as
/// converting inputs to StackTop type, or adding `up(n_)` shift functionality
/// to functions so we can test in cases where a function is called when stack
/// top is not at the bottom of the stack.
contract LibStackTopTest {
    using LibStackTop for bytes;
    using LibStackTop for uint256;
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;
    using LibMemorySize for bytes;
    using LibMemorySize for bytes[];
    using LibMemorySize for uint256;
    using LibMemorySize for uint256[];

    function doubler(uint256 a_) internal pure returns (uint256) {
        return a_ * 2;
    }

    function multiplier(Operand operand_, uint256 a_)
        internal
        pure
        returns (uint256)
    {
        return a_ * Operand.unwrap(operand_);
    }

    function summer(uint256 a_, uint256 b_) internal pure returns (uint256) {
        return a_ + b_;
    }

    function summer3(
        uint256 a_,
        uint256 b_,
        uint256 c_
    ) internal pure returns (uint256) {
        return a_ + b_ + c_;
    }

    function multiplier2(
        Operand operand_,
        uint256 a_,
        uint256 b_
    ) internal pure returns (uint256) {
        return (a_ + b_) * Operand.unwrap(operand_);
    }

    function multiply2HeadsWithTailSum(
        uint256 a_,
        uint256 b_,
        uint256[] memory tail_
    ) internal pure returns (uint256) {
        uint256 sum;
        for (uint256 i_ = 0; i_ < tail_.length; i_++) {
            sum += tail_[i_];
        }
        return (a_ + b_) * sum;
    }

    function multiply3HeadsWithTailSum(
        uint256 a_,
        uint256 b_,
        uint256 c_,
        uint256[] memory tail_
    ) internal pure returns (uint256) {
        uint256 sum;
        for (uint256 i_ = 0; i_ < tail_.length; i_++) {
            sum += tail_[i_];
        }
        return (a_ + b_ + c_) * sum;
    }

    function addHeadToTailsProduct(
        uint256 a_,
        uint256[] memory bs_,
        uint256[] memory cs_
    ) internal pure returns (uint256[] memory results_) {
        results_ = new uint256[](bs_.length);
        for (uint256 i_ = 0; i_ < bs_.length; i_++) {
            results_[i_] = bs_[i_] * cs_[i_] + a_;
        }
    }

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

    function consumeSentinel(
        uint256[] memory array_,
        uint256 sentinel_,
        uint256 stepSize_
    )
        external
        pure
        returns (
            StackTop stackTopSentinel_,
            uint256[] memory arraySentinel_,
            StackTop stackTop_,
            StackTop stackBottom_
        )
    {
        stackTop_ = array_.asStackTop().up(array_.size() / 0x20);
        stackBottom_ = array_.asStackTop();
        (stackTopSentinel_, arraySentinel_) = LibStackTop.consumeSentinel(
            stackTop_,
            stackBottom_,
            sentinel_,
            stepSize_
        );
    }

    function consumeSentinels(
        uint256[] memory array_,
        uint256 sentinel_,
        uint256 stepSize0_,
        uint256 stepSize1_
    )
        external
        pure
        returns (
            StackTop stackTopSentinel_,
            uint256[] memory arraySentinel0_,
            uint256[] memory arraySentinel1_,
            StackTop stackTop_,
            StackTop stackBottom_
        )
    {
        // move stackTop to typical `eval` start position
        stackTop_ = array_.asStackTop().up(array_.size() / 0x20);
        stackBottom_ = array_.asStackTop();

        (stackTopSentinel_, arraySentinel0_) = LibStackTop.consumeSentinel(
            stackTop_,
            stackBottom_,
            sentinel_,
            stepSize0_
        );

        // consume another sentinel using new stackTop
        (stackTopSentinel_, arraySentinel1_) = LibStackTop.consumeSentinel(
            stackTopSentinel_,
            stackBottom_,
            sentinel_,
            stepSize1_
        );
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

    function push(
        uint256[] memory array_,
        uint256 a_,
        uint256 b_,
        uint256 c_,
        uint256 d_,
        uint256 e_,
        uint256 f_,
        uint256 g_,
        uint256 h_
    ) external returns (StackTop stackTop_) {
        stackTop_ = array_.asStackTop();
        LibDebug.dumpMemory();
        stackTop_ = stackTop_.push(a_, b_, c_, d_, e_, f_, g_, h_);
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
        returns (bytes memory bytesCopy_)
    {
        StackTop stackTop_ = bytes_.asStackTop();
        LibDebug.dumpMemory();
        bytesCopy_ = stackTop_.asBytes();
        LibDebug.dumpMemory();
        return bytesCopy_;
    }

    function asStackTop(uint256[] memory array_)
        external
        returns (StackTop stackTop_)
    {
        LibDebug.dumpMemory();
        stackTop_ = array_.asStackTop();
        LibDebug.dumpMemory();
    }

    function asStackTopAsUint256Array(uint256[] memory array_)
        external
        returns (uint256[] memory arrayCopy_)
    {
        StackTop stackTop_ = array_.asStackTop();
        LibDebug.dumpMemory();
        arrayCopy_ = stackTop_.asUint256Array();
        LibDebug.dumpMemory();
        return arrayCopy_;
    }

    function list(uint256[] memory array_, uint256 length_)
        external
        returns (uint256 head_, uint256[] memory tail_)
    {
        LibDebug.dumpMemory();
        (head_, tail_) = array_.asStackTopUp().up(length_).list(length_);
        LibDebug.dumpMemory();
    }

    function up(uint256[] memory array_)
        external
        returns (StackTop stackTopBefore_, StackTop stackTopAfter_)
    {
        stackTopBefore_ = array_.asStackTop();
        LibDebug.dumpMemory();
        stackTopAfter_ = stackTopBefore_.up();
        LibDebug.dumpMemory();
    }

    function up(uint256[] memory array_, uint256 n_)
        external
        returns (StackTop stackTopBefore_, StackTop stackTopAfter_)
    {
        stackTopBefore_ = array_.asStackTop();
        LibDebug.dumpMemory();
        stackTopAfter_ = stackTopBefore_.up(n_);
        LibDebug.dumpMemory();
    }

    function upBytes(uint256[] memory array_, uint256 n_)
        external
        returns (StackTop stackTopBefore_, StackTop stackTopAfter_)
    {
        stackTopBefore_ = array_.asStackTop();
        LibDebug.dumpMemory();
        stackTopAfter_ = stackTopBefore_.upBytes(n_);
        LibDebug.dumpMemory();
    }

    function down(uint256[] memory array_)
        external
        returns (StackTop stackTopBefore_, StackTop stackTopAfter_)
    {
        stackTopBefore_ = array_.asStackTop();
        LibDebug.dumpMemory();
        stackTopAfter_ = stackTopBefore_.down();
        LibDebug.dumpMemory();
    }

    function down(uint256[] memory array_, uint256 n_)
        external
        returns (StackTop stackTopBefore_, StackTop stackTopAfter_)
    {
        stackTopBefore_ = array_.asStackTop();
        LibDebug.dumpMemory();
        stackTopAfter_ = stackTopBefore_.down(n_);
        LibDebug.dumpMemory();
    }

    function toIndex(uint256[] memory array0_, uint256[] memory array1_)
        external
        returns (
            uint256 index_,
            StackTop stackBottom_,
            StackTop stackTop_
        )
    {
        stackBottom_ = array0_.asStackTop();
        stackTop_ = array1_.asStackTop();
        LibDebug.dumpMemory();
        index_ = stackBottom_.toIndex(stackTop_);
        LibDebug.dumpMemory();
    }

    // function(uint256) internal view returns (uint256)
    function applyFn(uint256[] memory array_)
        external
        returns (StackTop stackTop_)
    {
        LibDebug.dumpMemory();
        stackTop_ = array_.asStackTop().up(array_.size() / 0x20).applyFn(
            doubler
        );
        LibDebug.dumpMemory();
    }

    // function(Operand, uint256) internal view returns (uint256)
    function applyFn(uint256[] memory array_, uint256 operand_)
        external
        returns (StackTop stackTop_)
    {
        LibDebug.dumpMemory();
        stackTop_ = array_.asStackTop().up(array_.size() / 0x20).applyFn(
            multiplier,
            Operand.wrap(operand_)
        );
        LibDebug.dumpMemory();
    }

    // function(uint256, uint256) internal view returns (uint256)
    function applyFnSummer(uint256[] memory array_)
        external
        returns (StackTop stackTop_)
    {
        LibDebug.dumpMemory();
        stackTop_ = array_.asStackTop().up(array_.size() / 0x20).applyFn(
            summer
        );
        LibDebug.dumpMemory();
    }

    // loop of function(uint256, uint256) internal view returns (uint256)
    function applyFnNSummer(uint256[] memory array_, uint256 n_)
        external
        returns (StackTop stackTop_)
    {
        LibDebug.dumpMemory();
        stackTop_ = array_.asStackTop().up(array_.size() / 0x20).applyFnN(
            summer,
            n_
        );
        LibDebug.dumpMemory();
    }

    // function(uint256, uint256, uint256) internal view returns (uint256)
    function applyFn3Summer(uint256[] memory array_)
        external
        returns (StackTop stackTop_)
    {
        LibDebug.dumpMemory();
        stackTop_ = array_.asStackTop().up(array_.size() / 0x20).applyFn(
            summer3
        );
        LibDebug.dumpMemory();
    }

    // function(Operand, uint256, uint256) internal view returns (uint256)
    function applyFn2Operand(uint256[] memory array_, uint256 operand_)
        external
        returns (StackTop stackTop_)
    {
        LibDebug.dumpMemory();
        stackTop_ = array_.asStackTop().up(array_.size() / 0x20).applyFn(
            multiplier2,
            Operand.wrap(operand_)
        );
        LibDebug.dumpMemory();
    }

    // function(uint256, uint256, uint256[] memory) internal view returns (uint256)
    function applyFn2Heads(uint256[] memory array_, uint256 length_)
        external
        returns (StackTop stackTop_)
    {
        LibDebug.dumpMemory();
        stackTop_ = array_.asStackTop().up(array_.size() / 0x20).applyFn(
            multiply2HeadsWithTailSum,
            length_
        );
        LibDebug.dumpMemory();
    }

    // function(uint256, uint256,, uint256 uint256[] memory) internal view returns (uint256)
    function applyFn3Heads(uint256[] memory array_, uint256 length_)
        external
        returns (StackTop stackTop_)
    {
        LibDebug.dumpMemory();
        stackTop_ = array_.asStackTop().up(array_.size() / 0x20).applyFn(
            multiply3HeadsWithTailSum,
            length_
        );
        LibDebug.dumpMemory();
    }

    // function(uint256, uint256[] memory, uint256[] memory) internal view returns (uint256[] memory)
    function applyFn2Tails(uint256[] memory array_, uint256 length_)
        external
        returns (StackTop stackTop_)
    {
        LibDebug.dumpMemory();
        stackTop_ = array_.asStackTop().up(array_.size() / 0x20).applyFn(
            addHeadToTailsProduct,
            length_
        );
        LibDebug.dumpMemory();
    }
}
