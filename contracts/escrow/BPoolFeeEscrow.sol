// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { TrustFactory } from "../trust/TrustFactory.sol";
import { Trust, TrustContracts, DistributionStatus } from "../trust/Trust.sol";
import { BPool }
from "@beehiveinnovation/configurable-rights-pool/contracts/test/BPool.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {
    ConfigurableRightsPool
}
// solhint-disable-next-line max-line-length
from "@beehiveinnovation/configurable-rights-pool/contracts/ConfigurableRightsPool.sol";

import "@openzeppelin/contracts/utils/EnumerableSet.sol";

contract BPoolFeeEscrow {
    using SafeMath for uint256;
    using Math for uint256;
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    TrustFactory public immutable trustFactory;

    // recipient => reserve => amount
    mapping(address => mapping(address => uint256)) public minFees;

    // fe => trust
    mapping(address => EnumerableSet.AddressSet) private pending;

    // trust => recipient => amount
    mapping(address => mapping(address => uint256)) public fees;

    // trust => amount
    mapping(address => uint256) public failureRefunds;
    mapping(address => uint256) public abandoned;

    // blocker => blockee
    mapping(address => EnumerableSet.AddressSet) private blocked;

    constructor(TrustFactory trustFactory_) public {
        trustFactory = trustFactory_;
    }

    // Requiring the trust is a child of the known factory means we know
    // exactly how it operates internally, not only the interface.
    // Without this check we'd need to guard against the Trust acting like:
    // - lying about distribution status to allow double dipping on fees
    // - lying about reserve and redeemable tokens
    // - some kind of reentrancy or hard to reason about state change
    modifier onlyFactoryTrust(Trust trust_) {
        require(trustFactory.isChild(address(trust_)), "FACTORY_TRUST");
        _;
    }

    function setMinFees(IERC20 reserve_, uint256 minFees_) external {
        require(minFees_ > 0, "MIN_FEES");
        minFees[msg.sender][address(reserve_)] = minFees_;
    }

    function unsetMinFees(address reserve_) external {
        delete(minFees[msg.sender][reserve_]);
    }

    function blockAccount(address blockee_) external {
        blocked[msg.sender].add(blockee_);
    }

    function unblockAccount(address blockee_) external {
        blocked[msg.sender].remove(blockee_);
    }

    // Recipient can abandon fees from troublesome trusts with no function
    // calls to external contracts.
    //
    // Catch-all solution for situations such as:
    // - Malicious/buggy reserves
    // - Gas griefing due to low min-fees
    // - Regulatory/reputational concerns
    //
    // The trust is NOT automatically blocked when the current fees are
    // abandoned. The sender MAY pay the gas to call `blockAccount` on the
    // trust explicitly before calling `abandonTrust`.
    function abandonTrust(Trust trust_) external {
        uint256 abandonedFee_ = fees[address(trust_)][msg.sender];
        delete(fees[address(trust_)][msg.sender]);
        abandoned[address(trust_)] = abandoned[address(trust_)]
            .add(abandonedFee_);
        failureRefunds[address(trust_)] = failureRefunds[address(trust_)]
            .sub(abandonedFee_);
        pending[msg.sender].remove(address(trust_));
    }

    function claimFeesMulti(address feeRecipient_, uint256 limit_)
        external
    {
        limit_ = limit_.min(pending[feeRecipient_].length());
        uint256 i_ = 0;
        while (i_ < limit_)
        {
            claimFees(
                // Keep hitting 0 because `pending` is mutated by `claimFees`
                // each iteration removing the processed claim.
                Trust(pending[feeRecipient_].at(0)),
                feeRecipient_
            );
            i_++;
        }
    }

    function claimFees(Trust trust_, address feeRecipient_)
        public
        onlyFactoryTrust(trust_)
    {
        DistributionStatus distributionStatus_ =
            trust_.getDistributionStatus();

        // If the distribution status has not reached a clear success/fail then
        // don't touch any escrow contract state. No-op.
        // If there IS a clear success/fail we process the claim either way,
        // clearing out the escrow contract state for the claim.
        // Tokens are only sent to the recipient on success.
        if (distributionStatus_ == DistributionStatus.Success
            || distributionStatus_ == DistributionStatus.Fail) {
            // The claim is no longer pending as we're processing it now.
            pending[feeRecipient_].remove(address(trust_));

            if (fees[address(trust_)][feeRecipient_] > 0) {
                uint256 claimableFee_ = fees[address(trust_)][feeRecipient_];
                delete(fees[address(trust_)][feeRecipient_]);
                if (distributionStatus_ == DistributionStatus.Success) {
                    TrustContracts memory trustContracts_ = trust_
                        .getContracts();
                    IERC20(trustContracts_.reserveERC20).safeTransfer(
                        feeRecipient_,
                        claimableFee_
                    );
                }
            }
        }
    }

    /// It is critical that a trust_ never oscillates between Fail/Success.
    /// If this invariant is violated the escrow funds can be drained by first
    /// claiming a fail, then ALSO claiming fees for a success.
    function refundFees(Trust trust_) external onlyFactoryTrust(trust_) {
        DistributionStatus distributionStatus_ =
            trust_.getDistributionStatus();

        uint256 refund_ = abandoned[address(trust_)];

        if (refund_ > 0) {
            delete(abandoned[address(trust_)]);
        }

        if (failureRefunds[address(trust_)] > 0 &&
            (distributionStatus_ == DistributionStatus.Fail
                || distributionStatus_ == DistributionStatus.Success)) {
            if (distributionStatus_ == DistributionStatus.Fail) {
                refund_ = refund_.add(failureRefunds[address(trust_)]);
            }
            delete(failureRefunds[address(trust_)]);
        }

        if (refund_ > 0) {
            TrustContracts memory trustContracts_ = trust_.getContracts();
            if (IERC20(trustContracts_.reserveERC20)
                .allowance(address(this), trustContracts_.redeemableERC20) <
                uint256(-1)) {
                IERC20(trustContracts_.reserveERC20)
                    .approve(trustContracts_.redeemableERC20, uint256(-1));
            }
            IERC20(trustContracts_.reserveERC20).safeTransfer(
                trustContracts_.redeemableERC20,
                refund_
            );
        }
    }

    function buyToken(
        Trust trust_,
        uint256 reserveAmountIn_,
        uint256 minTokenAmountOut_,
        uint256 maxPrice_,
        address feeRecipient_,
        uint256 fee_
    )
        external
        onlyFactoryTrust(trust_)
        returns (uint256 tokenAmountOut, uint256 spotPriceAfter)
    {
        // The fee recipient MUST NOT have blocked the sender.
        require(
            !blocked[feeRecipient_].contains(msg.sender),
            "BLOCKED_SENDER"
        );
        // The fee recipient MUST NOT have blocked the trust.
        require(
            !blocked[feeRecipient_].contains(address(trust_)),
            "BLOCKED_TRUST"
        );

        fees[address(trust_)][feeRecipient_] =
            fees[address(trust_)][feeRecipient_].add(fee_);
        failureRefunds[address(trust_)] = failureRefunds[address(trust_)]
            .add(fee_);
        pending[feeRecipient_].add(address(trust_));

        TrustContracts memory trustContracts_ = trust_.getContracts();
        require(
            fee_ > 0
            && fee_ >= minFees[feeRecipient_][trustContracts_.reserveERC20],
            "MIN_FEE"
        );

        IERC20(trustContracts_.reserveERC20).safeTransferFrom(
            msg.sender,
            address(this),
            reserveAmountIn_.add(fee_)
        );

        ConfigurableRightsPool(trustContracts_.crp).pokeWeights();

        if (IERC20(trustContracts_.reserveERC20)
            .allowance(address(this), trustContracts_.pool) < uint256(-1)) {
            IERC20(trustContracts_.reserveERC20)
                .approve(trustContracts_.pool, uint256(-1));
        }

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