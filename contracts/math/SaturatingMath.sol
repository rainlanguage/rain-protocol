// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

/// @title SaturatingMath
/// @notice Sometimes we neither want math operations to error nor wrap around
/// on an overflow or underflow. In the case of transferring assets an error
/// may cause assets to be locked in an irretrievable state within the erroring
/// contract, e.g. due to a tiny rounding/calculation error. We also can't have
/// assets underflowing and attempting to approve/transfer "infinity" when we
/// wanted "almost or exactly zero" but some calculation bug underflowed zero.
/// Ideally there are no calculation mistakes, but in guarding against bugs it
/// may be safer pragmatically to saturate arithmatic at the numeric bounds.
/// Note that saturating div is not supported because 0/0 is undefined.
library SaturatingMath {
    /// Lower bound of uint.
    uint private constant MIN = 0;
    /// Upper bound of uint.
    uint private constant MAX
        = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF;

    /// Saturating addition.
    /// @param a_ First term.
    /// @param b_ Second term.
    /// @return Minimum of a_ + b_ and `MAX`.
    function saturatingAdd(uint a_, uint b_)
        internal
        pure
        returns (uint)
    {
        unchecked {
            uint c_ = a_ + b_;
            return c_ < a_ ? MAX : c_;
        }
    }

    /// Saturating subtraction.
    /// @param a_ Minuend.
    /// @param b_ Subtrahend.
    /// @return a_ - b_ if a_ greater than b_, else 0.
    function saturatingSub(uint a_, uint b_)
        internal
        pure
        returns (uint)
    {
        unchecked {
            return a_ > b_ ? a_ - b_ : MIN;
        }
    }

    function saturatingMul(uint a_, uint b_)
        internal
        pure
        returns (uint)
    {
        unchecked {
            // Gas optimization: this is cheaper than requiring 'a' not being
            // zero, but the benefit is lost if 'b' is also tested.
            // https://github.com/OpenZeppelin/openzeppelin-contracts/pull/522
            if ( a_ == 0 ) return 0;
            uint c_ = a_ * b_;
            return c_ / a_ != b_ ? MAX : c_;
        }
    }
}