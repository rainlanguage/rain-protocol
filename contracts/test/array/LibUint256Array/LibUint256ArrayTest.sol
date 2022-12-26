// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../array/LibUint256Array.sol";
import "../../../interpreter/run/LibStackPointer.sol";

/// @title LibUint256ArrayTest
/// Thin wrapper around `LibUint256Array` library exposing methods for testing
contract LibUint256ArrayTest {
    using LibUint256Array for uint256[];
    using LibStackPointer for uint256[];
    using LibStackPointer for StackPointer;

    function arrayFrom(uint256 a_) external pure returns (uint256[] memory) {
        return LibUint256Array.arrayFrom(a_);
    }

    function arrayFrom(
        uint256 a_,
        uint256 b_
    ) external pure returns (uint256[] memory) {
        return LibUint256Array.arrayFrom(a_, b_);
    }

    function arrayFrom(
        uint256 a_,
        uint256 b_,
        uint256 c_
    ) external pure returns (uint256[] memory) {
        return LibUint256Array.arrayFrom(a_, b_, c_);
    }

    function arrayFrom(
        uint256 a_,
        uint256 b_,
        uint256 c_,
        uint256 d_
    ) external pure returns (uint256[] memory) {
        return LibUint256Array.arrayFrom(a_, b_, c_, d_);
    }

    function arrayFrom(
        uint256 a_,
        uint256 b_,
        uint256 c_,
        uint256 d_,
        uint256 e_
    ) external pure returns (uint256[] memory) {
        return LibUint256Array.arrayFrom(a_, b_, c_, d_, e_);
    }

    function arrayFrom(
        uint256 a_,
        uint256 b_,
        uint256 c_,
        uint256 d_,
        uint256 e_,
        uint256 f_
    ) external pure returns (uint256[] memory) {
        return LibUint256Array.arrayFrom(a_, b_, c_, d_, e_, f_);
    }

    function arrayFrom(
        uint256 a_,
        uint256[] memory tail_
    ) external pure returns (uint256[] memory) {
        return LibUint256Array.arrayFrom(a_, tail_);
    }

    function arrayFrom(
        uint256 a_,
        uint256 b_,
        uint256[] memory tail_
    ) external pure returns (uint256[] memory) {
        return LibUint256Array.arrayFrom(a_, b_, tail_);
    }

    function truncate(
        uint256[] memory array_,
        uint256 newLength_
    ) external pure returns (uint256[] memory) {
        array_.truncate(newLength_);
        return array_;
    }

    function extend(
        uint256[] memory base_,
        uint256[] memory extend_
    ) external pure returns (uint256[] memory baseCopy_) {
        baseCopy_ = new uint256[](base_.length);
        LibUint256Array.unsafeCopyValuesTo(
            base_,
            StackPointer.unwrap(baseCopy_.asStackPointer().up())
        );
        baseCopy_.extend(extend_);
        return baseCopy_;
    }

    function unsafeCopyValuesTo(
        uint256[] memory inputs_
    ) external pure returns (uint256[] memory) {
        uint256[] memory outputs_ = new uint256[](inputs_.length);
        LibUint256Array.unsafeCopyValuesTo(
            inputs_,
            StackPointer.unwrap(outputs_.asStackPointer().up())
        );
        return outputs_;
    }

    function copyToNewUint256Array(
        uint256[] memory inputs_
    ) external pure returns (uint256[] memory) {
        uint256 inputCursor_;
        assembly ("memory-safe") {
            inputCursor_ := add(inputs_, 0x20)
        }
        return
            LibUint256Array.copyToNewUint256Array(inputCursor_, inputs_.length);
    }

    function matrixFrom(
        uint256[] memory a_
    ) external pure returns (uint256[][] memory) {
        return LibUint256Array.matrixFrom(a_);
    }
}
