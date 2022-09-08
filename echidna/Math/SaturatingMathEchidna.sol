// SPDX-License-Identifier: CAL
pragma solidity 0.8.15;

import {SaturatingMath} from "../../contracts/math/SaturatingMath.sol";

/// @title SaturingMathEchidna
/// Wrapper around the `SaturatingMath` library for echidna fuzz testing.
contract SaturatingMathEchidna {
    function SaturatingAdd(uint256 a, uint256 b) external pure {
        uint256 c = SaturatingMath.saturatingAdd(a, b);

        if (a >= b) {
            assert(c >= a);
        } else {
            assert(c >= b);
        }
    }

    function SaturatingSub(uint256 a, uint256 b) external pure {
        uint256 c = SaturatingMath.saturatingSub(a, b);

        if (a > b) {
            assert(c <= a);
        } else {
            assert(c == 0);
        }
    }

    function SaturatingMul(uint256 a, uint256 b) external pure {
        uint256 c = SaturatingMath.saturatingMul(a, b);

        if (a == 0 || b == 0) {
            assert(c == 0);
        }

        if (c / a != b) {
            assert(c == type(uint256).max);
        } else {
            assert(a * b == c);
        }
    }
}
