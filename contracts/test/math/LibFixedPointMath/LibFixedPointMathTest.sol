// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {LibFixedPointMath} from "../../../math/LibFixedPointMath.sol";

import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

/// @title LibFixedPointMathTest
/// Thin wrapper around the `LibFixedPointMath` library for hardhat unit testing.
contract LibFixedPointMathTest {
    using LibFixedPointMath for uint256;

    /// Wraps `FixedPointMath.scale18`.
    /// Scale a fixed point decimal of some scale factor to match `DECIMALS`.
    /// @param a_ Some fixed point decimal value.
    /// @param aDecimals_ The number of fixed decimals of `a_`.
    /// @param rounding_ Rounding direction as per Open Zeppelin Math.
    /// @return `a_` scaled to match `DECIMALS`.
    function scale18(
        uint256 a_,
        uint256 aDecimals_,
        Math.Rounding rounding_
    ) external pure returns (uint256) {
        return a_.scale18(aDecimals_, rounding_);
    }

    /// Wraps `FixedPointMath.scaleN`.
    /// Scale a fixed point decimals of `DECIMALS` to some other scale.
    /// @param a_ A `DECIMALS` fixed point decimals.
    /// @param targetDecimals_ The new scale of `a_`.
    /// @param rounding_ Rounding direction as per Open Zeppelin Math.
    /// @return `a_` rescaled from `DECIMALS` to `targetDecimals_`.
    function scaleN(
        uint256 a_,
        uint256 targetDecimals_,
        Math.Rounding rounding_
    ) external pure returns (uint256) {
        return a_.scaleN(targetDecimals_, rounding_);
    }

    /// Wraps `FixedPointMath.scaleBy`.
    /// Scale a fixed point up or down by `scaleBy_` orders of magnitude.
    /// @param a_ Some integer of any scale.
    /// @param scaleBy_ OOMs to scale `a_` up or down by.
    /// @param rounding_ Rounding direction as per Open Zeppelin Math.
    /// @return `a_` rescaled according to `scaleBy_`.
    function scaleBy(
        uint256 a_,
        int8 scaleBy_,
        Math.Rounding rounding_
    ) external pure returns (uint256) {
        return a_.scaleBy(scaleBy_, rounding_);
    }

    /// Wraps `FixedPointMath.scaleRatio`.
    /// Scale a fixed point decimals of `DECIMALS` that represents a ratio of
    /// a_:b_ according to the decimals of a and b that MAY NOT be `DECIMALS`.
    /// @param ratio_ The ratio to be scaled.
    /// @param aDecimals_ The decimals of the ratio numerator.
    /// @param bDecimals_ The decimals of the ratio denominator.
    /// @param rounding_ Rounding direction as per Open Zeppelin Math.
    function scaleRatio(
        uint256 ratio_,
        uint256 aDecimals_,
        uint256 bDecimals_,
        Math.Rounding rounding_
    ) external pure returns (uint256) {
        return ratio_.scaleRatio(aDecimals_, bDecimals_, rounding_);
    }

    /// Wraps `FixedPointMath.scaleDown`.
    /// Scales `a_` down by a specified number of decimals, rounding in the
    /// specified direction. Used internally by several other functions in this
    /// lib.
    /// @param a_ The number to scale down.
    /// @param scaleDownBy_ Number of orders of magnitude to scale `a_` down by.
    /// @param rounding_ Rounding direction as per Open Zeppelin Math.
    /// @return `a_` scaled down by `scaleDownBy_` and rounded.
    function scaleDown(
        uint256 a_,
        uint256 scaleDownBy_,
        Math.Rounding rounding_
    ) external pure returns (uint256) {
        return a_.scaleDown(scaleDownBy_, rounding_);
    }

    /// Wraps `FixedPointMath.fixedPointMul`.
    /// Fixed point multiplication in native scale decimals.
    /// @param a_ First term.
    /// @param b_ Second term.
    /// @param rounding_ Rounding direction as per Open Zeppelin Math.
    /// @return `a_` multiplied by `b_` to `DECIMALS` fixed point decimals.
    function fixedPointMul(
        uint256 a_,
        uint256 b_,
        Math.Rounding rounding_
    ) external pure returns (uint256) {
        return a_.fixedPointMul(b_, rounding_);
    }

    /// Wraps `FixedPointMath.fixedPointDiv`.
    /// Fixed point division in native scale decimals.
    /// Both `a_` and `b_` MUST be `DECIMALS` fixed point decimals.
    /// @param a_ First term.
    /// @param b_ Second term.
    /// @param rounding_ Rounding direction as per Open Zeppelin Math.
    /// @return `a_` divided by `b_` to `DECIMALS` fixed point decimals.
    function fixedPointDiv(
        uint256 a_,
        uint256 b_,
        Math.Rounding rounding_
    ) external pure returns (uint256) {
        return a_.fixedPointDiv(b_, rounding_);
    }
}
