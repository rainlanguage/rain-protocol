// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

/// @title FixedPointMath
/// @notice Sometimes we want to do math with decimal values but all we have
/// are integers, typically uint256 integers. Floats are very complex so we
/// don't attempt to simulate them. Instead we provide a standard definition of
/// "one" as 10 ** 18 and scale everything up/down to this as fixed point math.
/// Overflows are errors as per Solidity.
library FixedPointMath {
    uint256 public constant DECIMALS = 18;
    uint256 public constant ONE = 10**DECIMALS;

    /// Scale a fixed point decimal of some scale factor to match `DECIMALS`.
    /// @param a_ Some fixed point decimal value.
    /// @param aDecimals_ The number of fixed decimals of `a_`.
    /// @return `a_` scaled to match `DECIMALS`.
    function scale18(uint256 a_, uint256 aDecimals_)
        internal
        pure
        returns (uint256)
    {
        if (DECIMALS == aDecimals_) {
            return a_;
        } else if (DECIMALS > aDecimals_) {
            return a_ * 10**(DECIMALS - aDecimals_);
        } else {
            return a_ / 10**(aDecimals_ - DECIMALS);
        }
    }

    /// Scale a fixed point decimals of `DECIMALS` to some other scale.
    /// @param a_ A `DECIMALS` fixed point decimals.
    /// @param targetDecimals_ The new scale of `a_`.
    /// @return `a_` rescaled from `DECIMALS` to `targetDecimals_`.
    function scaleN(uint256 a_, uint256 targetDecimals_)
        internal
        pure
        returns (uint256)
    {
        if (targetDecimals_ == DECIMALS) {
            return a_;
        } else if (DECIMALS > targetDecimals_) {
            return a_ / 10**(DECIMALS - targetDecimals_);
        } else {
            return a_ * 10**(targetDecimals_ - DECIMALS);
        }
    }

    /// Scale a fixed point up or down by `scaleBy_` orders of magnitude.
    /// The caller MUST ensure the end result matches `DECIMALS` if other
    /// functions in this library are to work correctly.
    /// Notably `scaleBy` is a SIGNED integer so scaling down by negative OOMS
    /// is supported.
    /// @param a_ Some integer of any scale.
    /// @param scaleBy_ OOMs to scale `a_` up or down by.
    /// @return `a_` rescaled according to `scaleBy_`.
    function scaleBy(uint256 a_, int8 scaleBy_)
        internal
        pure
        returns (uint256)
    {
        if (scaleBy_ == 0) {
            return a_;
        } else if (scaleBy_ > 0) {
            return a_ * 10**uint8(scaleBy_);
        } else {
            return a_ / 10**(~uint8(scaleBy_) + 1);
        }
    }

    /// Fixed point multiplication in native scale decimals.
    /// Both `a_` and `b_` MUST be `DECIMALS` fixed point decimals.
    /// @param a_ First term.
    /// @param b_ Second term.
    /// @return `a_` multiplied by `b_` to `DECIMALS` fixed point decimals.
    function fixedPointMul(uint256 a_, uint256 b_)
        internal
        pure
        returns (uint256)
    {
        return (a_ * b_) / ONE;
    }

    /// Fixed point division in native scale decimals.
    /// Both `a_` and `b_` MUST be `DECIMALS` fixed point decimals.
    /// @param a_ First term.
    /// @param b_ Second term.
    /// @return `a_` divided by `b_` to `DECIMALS` fixed point decimals.
    function fixedPointDiv(uint256 a_, uint256 b_)
        internal
        pure
        returns (uint256)
    {
        return (a_ * ONE) / b_;
    }
}
