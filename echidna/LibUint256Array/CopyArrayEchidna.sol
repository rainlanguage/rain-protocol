// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import {LibUint256Array} from "../../contracts/array/LibUint256Array.sol";

/// @title ArrayFromEchidna
/// Wrapper around the `LibUint256Array` library for testing arrayFrom functions with Echidna.
contract CopyArrayEchidna {
    // Function to unsafeCopyValuesTo that use the input and output cursor as arguments
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

 // Function to unsafeCopyValuesTo that use the output cursor as argument
    function UnsafeCopyValuesToWithO(uint256[] memory inputs_) external pure {
        uint256[] memory outputs_ = new uint256[](inputs_.length);

        uint256 outputCursor_;

        assembly ("memory-safe") {
            outputCursor_ := add(outputs_, 0x20)
        }

        LibUint256Array.unsafeCopyValuesTo(
            inputs_,
            outputCursor_
        );

        _compareArrays(inputs_, outputs_);
    }

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

    function _compareArrays(uint256[] memory array1_, uint256[] memory array2_)
        private
        pure
    {
        assert(array1_.length == array2_.length);

        for (uint256 i = 0; i < array1_.length; i++) {
            assert(array1_[i] == array2_[i]);
        }
    }
}
