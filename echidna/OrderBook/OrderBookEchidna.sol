// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {SafeCastUpgradeable as SafeCast} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import {LibOrderBook, OrderIOCalculation} from "../../contracts/orderbook/LibOrderBook.sol";
import {SaturatingMath} from "../../contracts/math/SaturatingMath.sol";
import {LibFixedPointMath, FP_DECIMALS, FP_ONE} from "../../contracts/math/LibFixedPointMath.sol"; 
import {ClearStateChange} from "../../contracts/orderbook/IOrderBookV1.sol" ;

/// Since we are fuzzing inputs rather than functionality the contract is
/// standalone.
contract OrderBookEchidna {
    using Math for uint256;
    using SafeCast for int256;
    using SaturatingMath for uint256;
    using LibFixedPointMath for uint256;

    OrderIOCalculation private aOrderIOCalculation_;
    OrderIOCalculation private bOrderIOCalculation_; 

    uint256 internal MAX_INT = 115792089237316195423570985008687907853269984665640564039457584007913129639935 ;

    //fuzz values for calculateIO to obtain outputMax and IORatios
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

        aOrderIORatio_ = _between(aOrderIORatio_, FP_ONE, FP_ONE * 100); 
        inputDecimals = _between(inputDecimals, 0, 30);        
        outputDecimals = _between(outputDecimals, 0, 30);   

        aVaultBalance = _between(aVaultBalance, 1, FP_ONE * FP_ONE);        
        bVaultBalance = _between(bVaultBalance, 1, FP_ONE * FP_ONE);
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


    
    function echidnaClearStateForRatioGTfpOne() external view returns (bool) {
        // OB._clearStateChange()
        ClearStateChange memory result_ = LibOrderBook._clearStateChange(
            aOrderIOCalculation_,
            bOrderIOCalculation_
        ); 

        uint256 ratioMul_ = aOrderIOCalculation_.IORatio.fixedPointMul(
                bOrderIOCalculation_.IORatio,
                Math.Rounding.Up
               )  ;

        if(ratioMul_ > FP_ONE) {
                /// If multiplication of ratios on `18` scale is greater than FP_ONE
                /// Either of the bounties must overflow
                require( 
                    result_.aOutput == 0 ||  
                    result_.bInput == 0  || 
                    result_.aOutput == 0 ||  
                    result_.bInput == 0 ||
                    result_.aOutput <= result_.bInput ||
                    result_.bOutput <= result_.aInput,
                    "RATIO"
                );
        }

        return true;
    } 

    function echidnaClearStateRatioLTEfpOne() external view returns (bool) {
        // OB._clearStateChange()
        ClearStateChange memory result_ = LibOrderBook._clearStateChange(
            aOrderIOCalculation_,
            bOrderIOCalculation_
        );  

        if(aOrderIOCalculation_.IORatio != 0 && bOrderIOCalculation_.IORatio != 0) {
            uint256 ratioMul_ = aOrderIOCalculation_.IORatio.fixedPointMul(
                bOrderIOCalculation_.IORatio,
                Math.Rounding.Up
               )  ;

            if (ratioMul_ <= FP_ONE) {  

                // mul is ZERO
                if (ratioMul_ == 0){  
                        require(
                        result_.aOutput == 0 ||  
                        result_.bInput == 0  || 
                        result_.aOutput == 0 ||  
                        result_.bInput == 0,
                        "ZERO"
                    );
                } 

                if (ratioMul_ == FP_ONE){  
                    require(result_.aOutput == result_.bInput || 
                            result_.bOutput == result_.aInput ,
                            "FP_ONE");
                        
                }else if(aOrderIOCalculation_.outputMax != 0 && bOrderIOCalculation_.outputMax != 0){
                    /// If multiplication of ratios on `18` scale is less than or equal to FP_ONE
                    /// OutputA >= InputB
                    /// OutputB >= InputA 
                    require(result_.aOutput >= result_.bInput, "A");
                    require(result_.bOutput >= result_.aInput, "B");
                }

                
            }


        }

        return true;
    }

    function _between(uint256 val, uint256 low, uint256 high) private pure returns(uint256) {
        return low + (val % (high-low +1)); 
    }

    
}