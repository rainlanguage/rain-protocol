// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import {LibUint256Array} from "../../array/LibUint256Array.sol";
import {LibStackTop, StackTop} from "../../vm/runtime/LibStackTop.sol";
import "hardhat/console.sol";

/// @title ArrayFromEchidna
/// Wrapper around the `LibUint256Array` library for testing arrayFrom functions with Echidna.
contract CopyArrayEchidna {
    using LibStackTop for uint256[];
    using LibStackTop for StackTop;

    function aver(uint256[] memory inputs_)
        external
        view
        returns (uint256[] memory)
    {
        uint256[] memory outputs_ = new uint256[](inputs_.length);

        uint256 inputCursor_ = StackTop.unwrap(inputs_.asStackTop().up());
        uint256 outputCursor_ = StackTop.unwrap(outputs_.asStackTop().up());

        console.log("inputCursor_: ", inputCursor_);
        console.log("outputCursor_: ", outputCursor_);

        LibUint256Array.unsafeCopyValuesTo(
            inputCursor_,
            outputCursor_,
            inputs_.length
        );
        return outputs_;
    }

    function aver2(uint256[] memory inputs_)
        external
        pure
        returns (uint256[] memory)
    {
        uint256[] memory outputs_ = new uint256[](inputs_.length);
        LibUint256Array.unsafeCopyValuesTo(
            inputs_,
            StackTop.unwrap(outputs_.asStackTop().up())
        );
        return outputs_;
    }
}
