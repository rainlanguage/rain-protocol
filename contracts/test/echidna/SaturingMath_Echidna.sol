// SPDX-License-Identifier: CAL
pragma solidity 0.8.15;

import {SaturatingMath} from "../../math/SaturatingMath.sol";

/// @title SaturingMath_Echidna
/// Wrapper around the `SaturatingMath` library for echidna fuzz testing.
contract SaturingMath_Echidna {
    uint256 a;
    uint256 b;
    uint256 c;

    /// Allow echidna add any value
    /// @param _a First term.
    /// @param _b Second term.
    function setValues(uint256 _a, uint256 _b) public {
        a = _a;
        b = _b;
    }

    function echidna_saturatingAdd() external returns (bool) {
        c = SaturatingMath.saturatingAdd(a, b);

        if (a >= b) {
            return c >= a;
        } else {
            return c >= b;
        }
    }

    function echidna_saturatingSub() external returns (bool) {
        c = SaturatingMath.saturatingSub(a, b);

        if (a > b) {
            return c <= a;
        } else {
            return c == 0;
        }
    }

    function echidna_saturatingMul() external returns (bool) {
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
