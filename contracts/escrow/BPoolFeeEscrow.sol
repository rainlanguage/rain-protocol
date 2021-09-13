// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { TrustFactory } from "../trust/TrustFactory.sol";
import { Trust, TrustContracts, DistributionStatus } from "../trust/Trust.sol";
import { BPool } from "../configurable-rights-pool/contracts/test/BPool.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract BPoolFeeEscrow {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    TrustFactory public immutable trustFactory;

    // trust => recipient => amount
    mapping(address => mapping(address => uint256)) public fees;
    // trust => amount
    mapping(address => uint256) public totalFees;

    constructor(TrustFactory trustFactory_) public {
        trustFactory = trustFactory_;
    }

    function feesClaim(Trust trust_, address feeRecipient_) external {
        require(trustFactory.isChild(address(trust_)), "NOT_FACTORY");
        require(
            trust_.getDistributionStatus() == DistributionStatus.Success,
            "DISTRIBUTION_STATUS"
        );
        // If the trust already claimed it is not possible for an individual
        // address to claim. These are mutually exclusive outcomes.
        require(totalFees[address(trust_)] > 0, "TRUST_CLAIM");
        uint256 fee_ = fees[address(trust_)][feeRecipient_];
        require(fee_ > 0, "FEE");
        delete(fees[address(trust_)][feeRecipient_]);

        // If any fees are claimed it is no longer possible for the trust to
        // claim. These are mutually exclusive outcomes.
        delete(totalFees[address(trust_)]);

        TrustContracts memory trustContracts_ = trust_.getContracts();
        IERC20(trustContracts_.reserveERC20).safeTransfer(
            feeRecipient_,
            fee_
        );
    }

    function trustClaim() external {
        require(trustFactory.isChild(msg.sender), "NOT_FACTORY");
        require(
            Trust(msg.sender).getDistributionStatus()
                == DistributionStatus.Fail,
            "DISTRIBUTION_STATUS"
        );
        uint256 fee_ = totalFees[msg.sender];
        // Can only claim once.
        delete(totalFees[msg.sender]);

        TrustContracts memory trustContracts_ = Trust(msg.sender)
            .getContracts();
        IERC20(trustContracts_.reserveERC20).safeTransfer(
            msg.sender,
            fee_
        );
    }

    function buyToken(
        Trust trust_,
        uint256 reserveAmountIn_,
        uint256 minTokenAmountOut_,
        uint256 maxPrice_,
        address feeRecipient_,
        uint256 fee_
    ) external returns (uint256 tokenAmountOut, uint256 spotPriceAfter) {
        require(trustFactory.isChild(address(trust_)), "NOT_FACTORY");

        fees[address(trust_)][feeRecipient_] =
            fees[address(trust_)][feeRecipient_].add(fee_);
        totalFees[address(trust_)] = totalFees[address(trust_)].add(fee_);

        TrustContracts memory trustContracts_ = trust_.getContracts();

        IERC20(trustContracts_.reserveERC20).safeTransferFrom(
            msg.sender,
            address(this),
            reserveAmountIn_.add(fee_)
        );

        (uint256 tokenAmountOut_, uint256 spotPriceAfter_) =
            BPool(trustContracts_.pool).swapExactAmountIn(
                trustContracts_.reserveERC20,
                reserveAmountIn_,
                trustContracts_.redeemableERC20,
                minTokenAmountOut_,
                maxPrice_
            );
        IERC20(trustContracts_.redeemableERC20).safeTransfer(
            msg.sender,
            tokenAmountOut_
        );
        return((tokenAmountOut_, spotPriceAfter_));
    }
}