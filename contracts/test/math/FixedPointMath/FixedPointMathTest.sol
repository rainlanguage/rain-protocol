// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {FixedPointMath} from "../../../math/FixedPointMath.sol";

import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

/// @title FixedPointMathTest
/// Thin wrapper around the `SaturatingMath` library for hardhat unit testing.
contract FixedPointMathTest {
    using FixedPointMath for uint256;

    /// Wraps `FixedPointMath.scale18`.
    /// Scale a fixed point decimal of some scale factor to match `DECIMALS`.
    /// @param a_ Some fixed point decimal value.
    /// @param aDecimals_ The number of fixed decimals of `a_`.
    /// @return `a_` scaled to match `DECIMALS`.
    function scale18(
        uint256 a_,
        uint256 aDecimals_
    ) external pure returns (uint256) {
        return a_.scale18(aDecimals_);
    }

    /// Wraps `FixedPointMath.scaleN`.
    /// Scale a fixed point decimals of `DECIMALS` to some other scale.
    /// @param a_ A `DECIMALS` fixed point decimals.
    /// @param targetDecimals_ The new scale of `a_`.
    /// @return `a_` rescaled from `DECIMALS` to `targetDecimals_`.
    function scaleN(
        uint256 a_,
        uint256 targetDecimals_
    ) external pure returns (uint256) {
        return a_.scaleN(targetDecimals_);
    }

    /// Wraps `FixedPointMath.scaleBy`.
    /// Scale a fixed point up or down by `scaleBy_` orders of magnitude.
    /// @param a_ Some integer of any scale.
    /// @param scaleBy_ OOMs to scale `a_` up or down by.
    /// @return `a_` rescaled according to `scaleBy_`.
    function scaleBy(
        uint256 a_,
        int8 scaleBy_
    ) external pure returns (uint256) {
        return a_.scaleBy(scaleBy_);
    }

    /// Wraps `FixedPointMath.fixedPointMul`.
    /// Fixed point multiplication in native scale decimals.
    /// @param a_ First term.
    /// @param b_ Second term.
    /// @return `a_` multiplied by `b_` to `DECIMALS` fixed point decimals.
    function fixedPointMul(
        uint256 a_,
        uint256 b_
    ) external pure returns (uint256) {
        return a_.fixedPointMul(b_);
    }

    /// Overloaded `fixedPointMul` that exposes underlying `mulDiv` rounding.
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
    /// @return `a_` divided by `b_` to `DECIMALS` fixed point decimals.
    function fixedPointDiv(
        uint256 a_,
        uint256 b_
    ) external pure returns (uint256) {
        return a_.fixedPointDiv(b_);
    }

    /// Overloaded `fixedPointDiv` that exposes underlying `mulDiv` rounding.
    function fixedPointDiv(
        uint256 a_,
        uint256 b_,
        Math.Rounding rounding_
    ) external pure returns (uint256) {
        return a_.fixedPointDiv(b_, rounding_);
    }
}
