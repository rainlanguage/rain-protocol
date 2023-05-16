// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import {LibFixedPointMath} from "../../../math/LibFixedPointMath.sol";

import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

/// @title LibFixedPointMathTest
/// Thin wrapper around the `LibFixedPointMath` library for hardhat unit testing.
contract LibFixedPointMathTest {
    using LibFixedPointMath for uint256;

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
