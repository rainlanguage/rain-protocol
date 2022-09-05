// SPDX-License-Identifier: CAL
pragma solidity 0.8.15;

import {FixedPointMath, FP_DECIMALS} from "../../contracts/math/FixedPointMath.sol";

/// @title FixedPointMathEchidna
/// Wrapper around the `FixedPointMath` library for echidna fuzz testing.
contract FixedPointMathEchidna {
    // Fuzz test to Scale a fixed point decimal of some scale factor to match the decimals.
    function Scale18(uint256 anyNumber_) external pure {
        // Using decimals between 0 and 30
        uint256 decimals = anyNumber_ % (30 + 1);

        // Using a value between 0 and 99999999999999999999
        uint256 initialValue = anyNumber_ % (99999999999999999999 + 1);

        uint256 valueScaled = FixedPointMath.scale18(initialValue, decimals);

        if (FP_DECIMALS == decimals) {
            assert(valueScaled == initialValue);
        } else {
            uint256 valueExpected;
            if (FP_DECIMALS > decimals) {
                //
                decimals = FP_DECIMALS - decimals;
                valueExpected = initialValue * 10**decimals;
            } else {
                //
                decimals = decimals - FP_DECIMALS;
                valueExpected = initialValue / 10**decimals;
            }

            assert(valueScaled == valueExpected);
        }
    }

    // Fuzz test to Scale a fixed point decimals of decimals to some other scale.
    function ScaleN(uint256 anyNumber_) external pure {
        // Using decimals between 0 and 30
        uint256 decimals = anyNumber_ % (30 + 1);

        // Using a value between 0 and 99999999999999999999
        uint256 initialValue = anyNumber_ % (99999999999999999999 + 1);

        uint256 valueScaled = FixedPointMath.scaleN(initialValue, decimals);

        if (FP_DECIMALS == decimals) {
            assert(valueScaled == initialValue);
        } else {
            uint256 valueExpected;
            if (FP_DECIMALS > decimals) {
                //
                decimals = FP_DECIMALS - decimals;
                valueExpected = initialValue / 10**decimals;
            } else {
                //
                decimals = decimals - FP_DECIMALS;
                valueExpected = initialValue * 10**decimals;
            }

            assert(valueScaled == valueExpected);
        }
    }
}
