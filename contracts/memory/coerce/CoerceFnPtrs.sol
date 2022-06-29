// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

library CoerceFnPtrs {
    function toUint256(function(uint256) pure returns (uint256) ptr_)
        internal
        pure
        returns (uint256 uint_)
    {
        assembly {
            uint_ := ptr_
        }
    }

    function toUint256(function(uint256, uint256) view returns (uint256) ptr_)
        internal
        pure
        returns (uint256 uint_)
    {
        assembly {
            uint_ := ptr_
        }
    }
}
