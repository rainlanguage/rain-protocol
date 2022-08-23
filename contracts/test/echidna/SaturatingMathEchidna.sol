// SPDX-License-Identifier: CAL
pragma solidity 0.8.15;

import {SaturatingMath} from "../../math/SaturatingMath.sol";

/// @title SaturingMathEchidna
/// Wrapper around the `SaturatingMath` library for echidna fuzz testing.
contract SaturatingMathEchidna {
    uint256 public a;
    uint256 public b;
    uint256 public c;

    /// Allow echidna add any value
    /// @param _a First term.
    /// @param _b Second term.
    function setValues(uint256 _a, uint256 _b) public {
        a = _a;
        b = _b;
    }

    function echidnaSaturatingAdd() external returns (bool) {
        c = SaturatingMath.saturatingAdd(a, b);

        if (a >= b) {
            return c >= a;
        } else {
            return c >= b;
        }
    }

    function echidnaSaturatingSub() external returns (bool) {
        c = SaturatingMath.saturatingSub(a, b);

        if (a > b) {
            return c <= a;
        } else {
            return c == 0;
        }
    }

    function echidnaSaturatingMul() external returns (bool) {
        c = SaturatingMath.saturatingMul(a, b);

        if (a == 0 || b == 0) {
            return c == 0;
        }

        if (c / a != b) {
            return c == type(uint256).max;
        } else {
            return true;
        }
    }
}
