// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

import {FixedPointMath, FP_DECIMALS, FP_ONE} from "../../contracts/math/FixedPointMath.sol";
import {FixedPointMathTest} from "../../contracts/test/math/FixedPointMath/FixedPointMathTest.sol";

/// @title FixedPointMathEchidna
/// Wrapper around the `FixedPointMath` library for echidna fuzz testing.
contract FixedPointMathEchidna {
    bytes4 private panicBytes = 0x4e487b71; // Code bytes on the data reason that represent Panic
    bytes1 private errorCodeUFOF = 0x11; // Error code bytes on the data reason that represent Overflow or Underflow
    bytes1 private errorCodeByZero = 0x12; // Error code bytes on the data reason that represent division or modulo by zero

    FixedPointMathTest private _fixedPointMathTest;

    event AssertionFailed();

    constructor() {
        _fixedPointMathTest = new FixedPointMathTest();
    }

    // Fuzz test to Scale a fixed point decimal of some scale factor to match the decimals.
    function Scale18(uint256 a_, uint256 aDecimals_) external view {
        try _fixedPointMathTest.scale18(a_, aDecimals_) returns (
            uint256 valueScaled
        ) {
            if (FP_DECIMALS == aDecimals_) {
                assert(a_ == valueScaled);
            } else {
                uint256 valueExpected;
                uint256 decimals;
                if (FP_DECIMALS > aDecimals_) {
                    //
                    decimals = FP_DECIMALS - aDecimals_;
                    valueExpected = a_ * 10 ** decimals;
                } else {
                    //
                    decimals = aDecimals_ - FP_DECIMALS;
                    valueExpected = a_ / 10 ** decimals;
                }

                assert(valueScaled == valueExpected);
            }
        } catch (bytes memory reason) {
            _checkReason(reason);
        }
    }

    // Fuzz test to Scale a fixed point decimals of decimals to some other scale.
    function ScaleN(uint256 a_, uint256 targetDecimals_) external view {
        try _fixedPointMathTest.scaleN(a_, targetDecimals_) returns (
            uint256 valueScaled
        ) {
            if (FP_DECIMALS == targetDecimals_) {
                assert(a_ == valueScaled);
            } else {
                uint256 valueExpected;
                uint256 decimals;
                if (FP_DECIMALS > targetDecimals_) {
                    //
                    decimals = FP_DECIMALS - targetDecimals_;
                    valueExpected = a_ / 10 ** decimals;
                } else {
                    //
                    decimals = targetDecimals_ - FP_DECIMALS;
                    valueExpected = a_ * 10 ** decimals;
                }

                assert(valueScaled == valueExpected);
            }
        } catch (bytes memory reason) {
            _checkReason(reason);
        }
    }

    // Fuzz test to Scale a fixed point up or down by scaleBy orders of magnitude.
    function ScaleBy(uint256 a_, int8 scaleBy_) external view {
        try _fixedPointMathTest.scaleBy(a_, scaleBy_) returns (
            uint256 valueScaled
        ) {
            if (scaleBy_ == 0) {
                assert(a_ == valueScaled);
            } else {
                uint256 valueExpected;
                if (scaleBy_ > 0) {
                    valueExpected = a_ * 10 ** uint8(scaleBy_);
                    assert(valueExpected == valueScaled);
                } else {
                    uint256 posScaleDownBy_ = uint8(-1 * scaleBy_);
                    valueExpected = a_ / 10 ** posScaleDownBy_;
                    assert(valueExpected == valueScaled);
                }
            }
        } catch (bytes memory reason) {
            _checkReason(reason);
        }
    }

    // Fuzz test to Fixed point multiplication in native scale decimals.
    function FixedPointMul(uint256 a_, uint256 b_) external view {
        uint256 valueCalculated = _fixedPointMathTest.fixedPointMul(a_, b_);

        // FixedPointMul call is using library from OZ contracts
        uint256 valueExpected = Math.mulDiv(a_, b_, FP_ONE);

        assert(valueCalculated == valueExpected);
    }

    // Fuzz test to Fixed point division in native scale decimals.
    function FixedPointDiv(uint256 a_, uint256 b_) external view {
        uint256 valueCalculated = _fixedPointMathTest.fixedPointDiv(a_, b_);

        // FixedPointDiv call is using library from OZ contracts
        uint256 valueExpected = Math.mulDiv(a_, FP_ONE, b_);

        assert(valueCalculated == valueExpected);
    }

    // Helper function to check a reason bytes agains a Panic revert with Underflow or Overflow error code
    function _checkReason(bytes memory reason_) private view {
        bytes4 failureReason = bytes4(reason_);
        bytes1 errorCode = reason_[reason_.length - 1];

        assert(failureReason == panicBytes);
        assert(errorCode == errorCodeUFOF);
    }
}
