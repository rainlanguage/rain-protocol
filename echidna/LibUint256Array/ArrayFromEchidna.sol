// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import {LibUint256Array} from "../../contracts/array/LibUint256Array.sol";

/// @title ArrayFromEchidna
/// Wrapper around the `LibUint256Array` library for testing arrayFrom functions with Echidna.
contract ArrayFromEchidna {
    function ArrayFromSingle(uint256 a_) external pure {
        uint256[] memory _arrayBuilt = LibUint256Array.arrayFrom(a_);

        assert(_arrayBuilt.length == 1);
        assert(_arrayBuilt[0] == a_);
    }

    function ArrayFromPair(uint256 a_, uint256 b_) external pure {
        uint256[] memory _arrayBuilt = LibUint256Array.arrayFrom(a_, b_);

        assert(_arrayBuilt.length == 2);
        assert(_arrayBuilt[0] == a_);
        assert(_arrayBuilt[1] == b_);
    }

    function ArrayFromSingleAndTail(uint256 a_, uint256[] memory tail_)
        external
        pure
    {
        uint256[] memory _arrayBuilt = LibUint256Array.arrayFrom(a_, tail_);

        uint256 headSize = 1; // Head Size. Before tail [a_, ...tail_]

        uint256 builtLength = headSize + tail_.length;

        assert(_arrayBuilt.length == builtLength);
        assert(_arrayBuilt[0] == a_);

        for (uint256 i = headSize; i < _arrayBuilt.length; i++) {
            assert(_arrayBuilt[i] == tail_[i - headSize]);
        }
    }

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
}
