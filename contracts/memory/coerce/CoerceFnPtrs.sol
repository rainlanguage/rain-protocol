// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

library CoerceFnPtrs {
    function toUint16(function(uint256) pure returns (uint256) ptr_)
        internal
        pure
        returns (uint16 uint16_)
    {
        uint uint_;
        assembly {
            uint_ := ptr_
        }
        uint16_ = uint16(uint_);
    }

    function toUint16(function(uint256, uint256) view returns (uint256) ptr_)
        internal
        pure
        returns (uint16 uint16_)
    {
        uint uint_;
        assembly {
            uint_ := ptr_
        }
        uint16_ = uint16(uint_);
    }
}
