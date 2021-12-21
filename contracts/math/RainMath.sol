// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

library RainMath {
    uint256 public constant MAX_UINT256
        = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    function saturatingSub(uint256 a_, uint256 b_)
        internal
        pure
        returns (uint256)
    {
        unchecked {
            return a_ > b_ ? a_ - b_ : 0;
        }
    }

    function saturatingAdd(uint256 a_, uint256 b_)
        internal
        pure
        returns (uint256)
    {
        unchecked {
            uint256 c_ = a_ + b_;
            return c_ < a_ ? MAX_UINT256 : c_;
        }
    }

    function saturatingDiv(uint256 a_, uint256 b_)
        internal
        pure
        returns (uint256)
    {
        unchecked {
            return b_ == 0 ? MAX_UINT256 : a_ / b_;
        }
    }

    function saturatingMul(uint256 a_, uint256 b_)
        internal
        pure
        returns (uint256)
    {
        unchecked {
            // Gas optimization: this is cheaper than requiring 'a' not being
            // zero, but the benefit is lost if 'b' is also tested.
            // https://github.com/OpenZeppelin/openzeppelin-contracts/pull/522
            if ( a_ == 0 ) return 0;
            uint256 c_ = a_ * b_;
            return c_ / a_ != b_ ? MAX_UINT256 : c_;
        }
    }
}