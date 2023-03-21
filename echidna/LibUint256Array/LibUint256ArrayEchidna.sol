// SPDX-License-Identifier: CAL
pragma solidity =0.8.18;

import {LibUint256Array} from "../../contracts/array/LibUint256Array.sol";

/// @title LibUint256ArrayEchidna
/// Wrapper around the `LibUint256Array` library for testing arrayFrom functions with Echidna.
contract LibUint256ArrayEchidna {
    // Test arrayFrom using a single value
    function ArrayFromSingle(uint256 a_) external pure {
        uint256[] memory _arrayBuilt = LibUint256Array.arrayFrom(a_);

        assert(_arrayBuilt.length == 1);
        assert(_arrayBuilt[0] == a_);
    }

    // Test arrayFrom using two values
    function ArrayFromPair(uint256 a_, uint256 b_) external pure {
        uint256[] memory _arrayBuilt = LibUint256Array.arrayFrom(a_, b_);

        assert(_arrayBuilt.length == 2);
        assert(_arrayBuilt[0] == a_);
        assert(_arrayBuilt[1] == b_);
    }

    // Test arrayFrom using a single value and a tail array
    function ArrayFromSingleAndTail(
        uint256 a_,
        uint256[] memory tail_
    ) external pure {
        uint256[] memory _arrayBuilt = LibUint256Array.arrayFrom(a_, tail_);

        uint256 headSize = 1; // Head Size. Before tail [a_, ...tail_]

        uint256 builtLength = headSize + tail_.length;

        assert(_arrayBuilt.length == builtLength);
        assert(_arrayBuilt[0] == a_);

        for (uint256 i = headSize; i < _arrayBuilt.length; i++) {
            assert(_arrayBuilt[i] == tail_[i - headSize]);
        }
    }

    // Test arrayFrom using two values and a tail array
    function ArrayFromPairAndTail(
        uint256 a_,
        uint256 b_,
        uint256[] memory tail_
    ) external pure {
        uint256[] memory _arrayBuilt = LibUint256Array.arrayFrom(a_, b_, tail_);

        uint256 headSize = 2; // Head Size. Before tail [a_, b_, ...tail_]

        uint256 builtLength = headSize + tail_.length;

        assert(_arrayBuilt.length == builtLength);
        assert(_arrayBuilt[0] == a_);
        assert(_arrayBuilt[1] == b_);

        for (uint256 i = headSize; i < _arrayBuilt.length; i++) {
            assert(_arrayBuilt[i] == tail_[i - headSize]);
        }
    }

    // Test truncate using a random array and a random number
    function Truncate(
        uint256[] memory array_,
        uint256 anyNumber_
    ) external pure {
        uint256[] memory originalArray = array_;
        uint256 originalLength = array_.length;
        uint256 desiredLength = anyNumber_ % (originalLength + 1);

        assert(desiredLength <= originalLength); // Making sure the desired length is correctly

        LibUint256Array.truncate(array_, desiredLength);

        assert(array_.length == desiredLength);

        for (uint256 i = 0; i < desiredLength; i++) {
            assert(array_[i] == originalArray[i]);
        }
    }

    // Test extended using two random arrays
    function Extend(
        uint256[] memory base_,
        uint256[] memory extend_
    ) external pure {
        uint256[] memory originalBase = base_;
        uint256[] memory originalExtend = extend_;

        uint256 baseLength = base_.length;
        uint256 extendLength = extend_.length;
        uint256 finalLength = baseLength + extendLength;

        LibUint256Array.extend(base_, base_);

        assert(base_.length == finalLength);

        for (uint256 i = 0; i < finalLength; i++) {
            if (i < baseLength) {
                assert(base_[i] == originalBase[i]);
            } else {
                assert(base_[i] == originalExtend[i]);
            }
        }
    }

    // Test unsafeCopyValuesTo that use the input and output cursor as arguments
    function UnsafeCopyValuesToWithIO(uint256[] memory inputs_) external pure {
        uint256[] memory outputs_ = new uint256[](inputs_.length);

        uint256 inputCursor_;
        uint256 outputCursor_;

        assembly ("memory-safe") {
            inputCursor_ := add(inputs_, 0x20)
            outputCursor_ := add(outputs_, 0x20)
        }

        LibUint256Array.unsafeCopyValuesTo(
            inputCursor_,
            outputCursor_,
            inputs_.length
        );

        _compareArrays(inputs_, outputs_);
    }

    // Test unsafeCopyValuesTo that use the output cursor as argument
    function UnsafeCopyValuesToWithO(uint256[] memory inputs_) external pure {
        uint256[] memory outputs_ = new uint256[](inputs_.length);

        uint256 outputCursor_;

        assembly ("memory-safe") {
            outputCursor_ := add(outputs_, 0x20)
        }

        LibUint256Array.unsafeCopyValuesTo(inputs_, outputCursor_);

        _compareArrays(inputs_, outputs_);
    }

    // Test copyToNewUint256Array using a array and an input
    function CopyToNewUint256Array(uint256[] memory inputs_) external pure {
        uint256 inputCursor_;
        assembly ("memory-safe") {
            inputCursor_ := add(inputs_, 0x20)
        }

        uint256[] memory outputs_ = LibUint256Array.copyToNewUint256Array(
            inputCursor_,
            inputs_.length
        );

        _compareArrays(inputs_, outputs_);
    }

    function _compareArrays(
        uint256[] memory array1_,
        uint256[] memory array2_
    ) private pure {
        assert(array1_.length == array2_.length);

        for (uint256 i = 0; i < array1_.length; i++) {
            assert(array1_[i] == array2_[i]);
        }
    }
}
