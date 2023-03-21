// SPDX-License-Identifier: CAL
pragma solidity =0.8.18;

import {SafeCastUpgradeable as SafeCast} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import {LibOrderBook, OrderIOCalculation} from "../../contracts/orderbook/LibOrderBook.sol";
import {SaturatingMath} from "../../contracts/math/SaturatingMath.sol";
import {LibFixedPointMath, FP_DECIMALS, FP_ONE} from "../../contracts/math/LibFixedPointMath.sol";
import {ClearStateChange} from "../../contracts/orderbook/IOrderBookV1.sol";

/// Since we are fuzzing inputs rather than functionality the contract is
/// standalone.
contract OrderBookEchidna {
    using Math for uint256;
    using SafeCast for int256;
    using SaturatingMath for uint256;
    using LibFixedPointMath for uint256;

    OrderIOCalculation private aOrderIOCalculation_;
    OrderIOCalculation private bOrderIOCalculation_;

    uint256 internal MAX_INT =
        115792089237316195423570985008687907853269984665640564039457584007913129639935;

    //Fuzz values for calculateIO to obtain outputMax and IORatios
    function setCalculateOrderIO(
        uint256 aOrderOutputMax_,
        uint256 bOrderOutputMax_,
        uint256 aOrderIORatio_,
        uint256 inputDecimals,
        uint256 outputDecimals,
        uint256 aVaultBalance,
        uint256 bVaultBalance
    ) public {
        OrderIOCalculation memory _aOrderIOCalculation;
        OrderIOCalculation memory _bOrderIOCalculation;

        aOrderIORatio_ = _between(aOrderIORatio_, 1, MAX_INT);
        inputDecimals = _between(inputDecimals, 0, 77);
        outputDecimals = _between(outputDecimals, 0, 77);

        aVaultBalance = _between(aVaultBalance, 1, MAX_INT);
        bVaultBalance = _between(bVaultBalance, 1, MAX_INT);
        aOrderOutputMax_ = _between(aOrderOutputMax_, 1, MAX_INT);
        bOrderOutputMax_ = _between(bOrderOutputMax_, 1, MAX_INT);

        uint256 bOrderIORatio_ = FP_ONE.fixedPointDiv(
            aOrderIORatio_,
            Math.Rounding.Up
        );

        aOrderOutputMax_ = aOrderOutputMax_.scaleN(
            outputDecimals,
            Math.Rounding.Down
        );

        aOrderIORatio_ = aOrderIORatio_.scaleRatio(
            outputDecimals,
            inputDecimals,
            Math.Rounding.Up
        );

        aOrderOutputMax_ = aOrderOutputMax_.min(aVaultBalance);

        _aOrderIOCalculation.outputMax = aOrderOutputMax_;
        _aOrderIOCalculation.IORatio = aOrderIORatio_;
        aOrderIOCalculation_ = _aOrderIOCalculation;

        bOrderOutputMax_ = bOrderOutputMax_.scaleN(
            inputDecimals,
            Math.Rounding.Down
        );

        bOrderIORatio_ = bOrderIORatio_.scaleRatio(
            inputDecimals,
            outputDecimals,
            Math.Rounding.Up
        );

        bOrderOutputMax_ = bOrderOutputMax_.min(bVaultBalance);

        _bOrderIOCalculation.outputMax = bOrderOutputMax_;
        _bOrderIOCalculation.IORatio = bOrderIORatio_;
        bOrderIOCalculation_ = _bOrderIOCalculation;
    }

    //Echidna fuzz for all where IORatio * IORatio > FP_ONE
    function echidnaClearStateForRatioGTfpOne() external view returns (bool) {
        if (
            _checkForMathOverflow(bOrderIOCalculation_, aOrderIOCalculation_) &&
            _checkForValidRatio(bOrderIOCalculation_, aOrderIOCalculation_)
        ) {
            ClearStateChange memory result_ = LibOrderBook._clearStateChange(
                aOrderIOCalculation_,
                bOrderIOCalculation_
            );

            uint256 ratioMul_ = aOrderIOCalculation_.IORatio.fixedPointMul(
                bOrderIOCalculation_.IORatio,
                Math.Rounding.Up
            );

            if (ratioMul_ > FP_ONE) {
                /// If multiplication of ratios on `18` scale is greater than FP_ONE
                /// Either of the bounties must overflow
                require(
                    result_.aOutput == 0 ||
                        result_.bInput == 0 ||
                        result_.aOutput == 0 ||
                        result_.bInput == 0 ||
                        result_.aOutput <= result_.bInput ||
                        result_.bOutput <= result_.aInput,
                    "RATIO"
                );
            }
        }

        return true;
    }

    //Echidna fuzz for all where IORatio * IORatio <= FP_ONE
    function echidnaClearStateRatioLTEfpOne() external view returns (bool) {
        if (
            _checkForMathOverflow(bOrderIOCalculation_, aOrderIOCalculation_) &&
            _checkForValidRatio(bOrderIOCalculation_, aOrderIOCalculation_)
        ) {
            ClearStateChange memory result_ = LibOrderBook._clearStateChange(
                aOrderIOCalculation_,
                bOrderIOCalculation_
            );

            if (
                aOrderIOCalculation_.IORatio != 0 &&
                bOrderIOCalculation_.IORatio != 0
            ) {
                uint256 ratioMul_ = aOrderIOCalculation_.IORatio.fixedPointMul(
                    bOrderIOCalculation_.IORatio,
                    Math.Rounding.Up
                );

                if (ratioMul_ <= FP_ONE) {
                    // If IORatio * IORatio is zero check for no spread
                    if (ratioMul_ == 0) {
                        require(
                            result_.aOutput == 0 ||
                                result_.bInput == 0 ||
                                result_.aOutput == 0 ||
                                result_.bInput == 0,
                            "ZERO"
                        );
                    }

                    if (ratioMul_ == FP_ONE) {
                        // If IORatio * IORatio is FP_ONE check for an exact match on spread
                        require(
                            result_.aOutput == result_.bInput ||
                                result_.bOutput == result_.aInput,
                            "FP_ONE"
                        );
                    } else if (
                        aOrderIOCalculation_.outputMax != 0 &&
                        bOrderIOCalculation_.outputMax != 0
                    ) {
                        /// If multiplication of ratios on `18` scale is less than or equal to FP_ONE
                        /// OutputA >= InputB
                        /// OutputB >= InputA
                        require(result_.aOutput >= result_.bInput, "A");
                        require(result_.bOutput >= result_.aInput, "B");
                    }
                }
            }
        }
        return true;
    }

    function _checkForMathOverflow(
        OrderIOCalculation memory bOrder_,
        OrderIOCalculation memory aOrder_
    ) private pure returns (bool) {
        return (mulDivNotOverflow(bOrder_.outputMax, bOrder_.IORatio, FP_ONE) &&
            mulDivNotOverflow(aOrder_.outputMax, aOrder_.IORatio, FP_ONE));
    }

    // Check for valid ratio
    // If output * IORatio < 1 , IORatio is increased which may eat into bounty
    function _checkForValidRatio(
        OrderIOCalculation memory bOrder_,
        OrderIOCalculation memory aOrder_
    ) private pure returns (bool) {
        uint256 checkValidRatioA_ = bOrder_.outputMax.fixedPointMul(
            bOrder_.IORatio,
            Math.Rounding.Up
        );

        uint256 checkValidRatioB_ = aOrder_.outputMax.fixedPointMul(
            aOrder_.IORatio,
            Math.Rounding.Up
        );

        return !(checkValidRatioA_ < 1 || checkValidRatioB_ < 1);
    }

    // Check for overflow in LibFixedPointMath.fixedPointMul
    function mulDivNotOverflow(
        uint256 x,
        uint256 y,
        uint256 denominator
    ) private pure returns (bool result_) {
        unchecked {
            uint256 prod0; // Least significant 256 bits of the product
            uint256 prod1; // Most significant 256 bits of the product
            assembly {
                let mm := mulmod(x, y, not(0))
                prod0 := mul(x, y)
                prod1 := sub(sub(mm, prod0), lt(mm, prod0))
            }

            // Handle non-overflow cases, 256 by 256 division.
            if (prod1 == 0) {
                return true;
            }

            // Make sure the result is less than 2^256. Also prevents denominator == 0.
            return (denominator > prod1);
        }
    }

    // Adjust the value between high and low
    function _between(
        uint256 val,
        uint256 low,
        uint256 high
    ) private pure returns (uint256) {
        return low + (val % (high - low + 1));
    }
}
