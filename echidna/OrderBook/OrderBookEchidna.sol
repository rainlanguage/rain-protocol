// SPDX-License-Identifier: CAL
pragma solidity =0.8.17; 

import {SafeCastUpgradeable as SafeCast} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

import {SaturatingMath} from "../../contracts/math/SaturatingMath.sol"; 
import {FixedPointMath, FP_DECIMALS, FP_ONE} from "../../contracts/math/FixedPointMath.sol";

/// Since we are fuzzing inputs rather than functionality the contract is 
/// standalone. 
contract OrderBookEchidna  {  

    using Math for uint256;
    using SafeCast for int256;
    using SaturatingMath for uint256;
    using FixedPointMath for uint256;


    struct OrderIOCalculation {
        uint256 outputMax;
        //solhint-disable-next-line var-name-mixedcase
        uint256 IORatio;
    } 

    struct ClearStateChange {
        uint256 aOutput;
        uint256 bOutput;
        uint256 aInput;
        uint256 bInput;
    }

    OrderIOCalculation private aOrderIOCalculation_ ; 
    OrderIOCalculation private bOrderIOCalculation_ ;  


    //fuzz values for calculateIO to obtain outputMax and IORatios
    function setCalculateOrderIO(
        uint256 aOrderOutputMax_ ,
        uint256 bOrderOutputMax_ ,
        uint256 aOrderIORatio_ ,
        uint256 inputDecimals ,
        uint256 outputDecimals ,  
        uint256 aVaultBalance ,
        uint256 bVaultBalance 

    ) public { 


        OrderIOCalculation memory _aOrderIOCalculation;
        OrderIOCalculation memory _bOrderIOCalculation;

        uint256 bOrderIORatio_ = FP_ONE.fixedPointDiv(aOrderIORatio_,Math.Rounding.Up) ;  

        aOrderOutputMax_ = aOrderOutputMax_.scaleN(
                outputDecimals,
                Math.Rounding.Down
        ); 

        aOrderIORatio_ = aOrderIORatio_.scaleRatio(
                outputDecimals,
                inputDecimals,
                Math.Rounding.Up
        );  

        aOrderOutputMax_ = aOrderOutputMax_.min(
                aVaultBalance
        );  

        _aOrderIOCalculation.outputMax =  aOrderOutputMax_ ;
        _aOrderIOCalculation.IORatio =  aOrderIORatio_ ;
        aOrderIOCalculation_ = _aOrderIOCalculation ;
    
        bOrderOutputMax_ = bOrderOutputMax_.scaleN(
                inputDecimals,
                Math.Rounding.Down
        ); 

        bOrderIORatio_ = bOrderIORatio_.scaleRatio(
                inputDecimals,
                outputDecimals,
                Math.Rounding.Up
        );  

        bOrderOutputMax_ = bOrderOutputMax_.min(
                bVaultBalance
        );

        _bOrderIOCalculation.outputMax = bOrderOutputMax_ ;
        _bOrderIOCalculation.IORatio =  bOrderIORatio_ ; 
        bOrderIOCalculation_ =_bOrderIOCalculation ;

    } 

    // Echidna Fuzz for all 
    function echidnaClearState() external view returns (bool) { 

        ClearStateChange memory result_ = _clearStateChange( 
            aOrderIOCalculation_ ,
            bOrderIOCalculation_
        ) ;   

        if(aOrderIOCalculation_.IORatio.fixedPointMul(bOrderIOCalculation_.IORatio , Math.Rounding.Up) <= FP_ONE){ 
            /// If multiplication of ratios on `18` scale is less than or equal to FP_ONE
            /// OutputA >= InputB
            /// OutputB >= InputA
            require(result_.aOutput >= result_.bInput , "A") ;
            require(result_.bOutput >= result_.aInput , "B") ;
        }else{ 
            /// If multiplication of ratios on `18` scale is greater than FP_ONE
            /// Either of the bounties must overflow
            require(result_.aOutput < result_.bInput || result_.aOutput < result_.bInput , "RATIO") ;
        }

        return true ; 

    }   

    // Helper function mimicks OB _clearStateChange
    function _clearStateChange(
        OrderIOCalculation memory aOrderIOCalc_,
        OrderIOCalculation memory bOrderIOCalc_
    ) private pure returns (ClearStateChange memory) {
        ClearStateChange memory clearStateChange_;
        {

            


            clearStateChange_.aOutput = aOrderIOCalc_.outputMax.min(
                // B's input is A's output.
                // A cannot output more than their max.
                // B wants input of their IO ratio * their output.
                // Always round IO calculations up. 
    
                bOrderIOCalc_.outputMax.fixedPointMul(
                    bOrderIOCalc_.IORatio,
                    Math.Rounding.Up
                )
            ); 

            clearStateChange_.bOutput = bOrderIOCalc_.outputMax.min(
                // A's input is B's output.
                // B cannot output more than their max.
                // A wants input of their IO ratio * their output.
                // Always round IO calculations up.
                aOrderIOCalc_.outputMax.fixedPointMul(
                    aOrderIOCalc_.IORatio,
                    Math.Rounding.Up
                )
            );


            // A's input is A's output * their IO ratio.
            // Always round IO calculations up.
            clearStateChange_.aInput = clearStateChange_.aOutput.fixedPointMul(
                aOrderIOCalc_.IORatio,
                Math.Rounding.Up
            ); 



            // B's input is B's output * their IO ratio.
            // Always round IO calculations up.
            clearStateChange_.bInput = clearStateChange_.bOutput.fixedPointMul(
                bOrderIOCalc_.IORatio,
                Math.Rounding.Up
            ); 

            
        }
        return clearStateChange_;
    }

    

    

    

}