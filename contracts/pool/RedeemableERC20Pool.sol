// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SaturatingMath } from "../math/SaturatingMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// solhint-disable-next-line max-line-length
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { Rights } from "./IRightsManager.sol";
import { ICRPFactory } from "./ICRPFactory.sol";
import { IBPool } from "./IBPool.sol";
// solhint-disable-next-line max-line-length
import { PoolParams, IConfigurableRightsPool } from "./IConfigurableRightsPool.sol";

import { IBalancerConstants } from "./IBalancerConstants.sol";

import { RedeemableERC20 } from "../redeemableERC20/RedeemableERC20.sol";

// solhint-disable-next-line max-line-length
import { Trust, DistributionStatus, DistributionProgress } from "../trust/Trust.sol";
import { Phase, Phased } from "../phased/Phased.sol";

/// Everything required to setup a `ConfigurableRightsPool` for a `Trust`.
struct CRPConfig {
    /// The CRPFactory on the current network.
    /// This is an address published by Balancer or deployed locally during
    /// testing.
    address crpFactory;
    /// The BFactory on the current network.
    /// This is an address published by Balancer or deployed locally during
    /// testing.
    address balancerFactory;
    /// Reserve side of the pool pair.
    IERC20 reserve;
    /// Redeemable ERC20 side of the pool pair.
    RedeemableERC20 token;
    /// Initial reserve value in the pool.
    uint reserveInit;
    // Initial marketcap of the token according to the balancer pool
    // denominated in reserve token.
    // The spot price of the token is ( market cap / token supply ) where
    // market cap is defined in terms of the reserve.
    // The spot price of a balancer pool token is a function of both the
    // amounts of each token and their weights.
    // This bonding curve is described in the Balancer whitepaper.
    // We define a valuation of newly minted tokens in terms of the deposited
    // reserve. The reserve weight is set to the minimum allowable value to
    // achieve maximum capital efficiency for the fund raising.
    uint initialValuation;
}

/// @title RedeemableERC20Pool
/// @notice The Balancer LBP functionality is wrapped by `RedeemableERC20Pool`.
///
/// Ensures the pool tokens created during the initialization of the
/// Balancer LBP are owned by the `Trust` and never touch an externally owned
/// account.
///
/// `RedeemableERC20Pool` has several phases:
///
/// - `Phase.ZERO`: Deployed not trading but can be by owner calling
/// `ownerStartDutchAuction`
/// - `Phase.ONE`: Trading open
/// - `Phase.TWO`: Trading open but can be closed by owner calling
/// `ownerEndDutchAuction`
/// - `Phase.THREE`: Trading closed
///
/// `RedeemableERC20Pool` expects the `Trust` to schedule the phases correctly
/// and ensure proper guards around these library functions.
///
/// @dev Deployer and controller for a Balancer ConfigurableRightsPool.
/// This library is intended for internal use by a `Trust`.
library RedeemableERC20Pool {
    using Math for uint256;
    using SaturatingMath for uint256;
    using SafeERC20 for IERC20;
    using SafeERC20 for RedeemableERC20;

    /// Balancer requires a minimum balance of `10 ** 6` for all tokens at all
    /// times. ConfigurableRightsPool repo misreports this as 10 ** 12 but the
    /// Balancer Core repo has it set as `10 ** 6`. We add one here to protect
    /// ourselves against rounding issues.
    uint public constant MIN_BALANCER_POOL_BALANCE = 10 ** 6 + 1;
    /// To ensure that the dust at the end of the raise is dust-like, we
    /// enforce a minimum starting reserve balance 100x the minimum.
    uint public constant MIN_RESERVE_INIT = 10 ** 8;

    /// Configures and deploys the `ConfigurableRightsPool`.
    /// Call this during the `Trust` constructor.
    /// @param config_ All configuration for the `RedeemableERC20Pool`.
    function setupCRP(CRPConfig memory config_)
        external
        returns (IConfigurableRightsPool)
    {
        Trust self_ = Trust(address(this));

        // The addresses in the `RedeemableERC20Pool`, as `[reserve, token]`.
        address[] memory poolAddresses_ = new address[](2);
        poolAddresses_[0] = address(config_.reserve);
        poolAddresses_[1] = address(config_.token);

        // Initial amounts as configured reserve init and total token supply.
        uint[] memory poolAmounts_ = new uint[](2);
        poolAmounts_[0] = config_.reserveInit;
        poolAmounts_[1] = config_.token.totalSupply();
        require(
            poolAmounts_[0] >= MIN_RESERVE_INIT,
            "RESERVE_INIT_MINIMUM"
        );
        require(poolAmounts_[1] > 0, "TOKEN_INIT_0");

        // Initital weights follow initial valuation reserve denominated.
        uint[] memory initialWeights_ = new uint[](2);
        initialWeights_[0] = IBalancerConstants.MIN_WEIGHT;
        initialWeights_[1] = valuationWeight(
            config_.reserveInit,
            config_.initialValuation
        );

        address crp_ = ICRPFactory(config_.crpFactory).newCrp(
            config_.balancerFactory,
            PoolParams(
                "R20P",
                "RedeemableERC20Pool",
                poolAddresses_,
                poolAmounts_,
                initialWeights_,
                IBalancerConstants.MIN_FEE
            ),
            Rights(
                // 0. Pause
                false,
                // 1. Change fee
                false,
                // 2. Change weights
                // (`true` needed to set gradual weight schedule)
                true,
                // 3. Add/remove tokens
                false,
                // 4. Whitelist LPs (default behaviour for `true` is that
                //    nobody can `joinPool`)
                true,
                // 5. Change cap
                false
            )
        );

        // Need to grant transfers for a few balancer addresses to facilitate
        // setup and exits.
        config_.token.grantReceiver(
            address(IConfigurableRightsPool(crp_).bFactory())
        );
        config_.token.grantReceiver(
            address(self_)
        );
        config_.token.grantSender(
            crp_
        );

        // Preapprove all tokens and reserve for the CRP.
        require(
            config_.reserve.approve(address(crp_), config_.reserveInit),
            "RESERVE_APPROVE"
        );
        require(
            config_.token.approve(address(crp_),
            config_.token.totalSupply()),
            "TOKEN_APPROVE"
        );

        return IConfigurableRightsPool(crp_);
    }

    /// https://balancer.finance/whitepaper/
    /// Spot = ( Br / Wr ) / ( Bt / Wt )
    /// => ( Bt / Wt ) = ( Br / Wr ) / Spot
    /// => Wt = ( Spot x Bt ) / ( Br / Wr )
    ///
    /// Valuation = Spot * Token supply
    /// Valuation / Supply = Spot
    /// => Wt = ( ( Val / Supply ) x Bt ) / ( Br / Wr )
    ///
    /// Bt = Total supply
    /// => Wt = ( ( Val / Bt ) x Bt ) / ( Br / Wr )
    /// => Wt = Val / ( Br / Wr )
    ///
    /// Wr = Min weight = 1
    /// => Wt = Val / Br
    ///
    /// Br = reserve balance
    /// => Wt = Val / reserve balance (reserve init if no trading occurs)
    /// @param reserveBalance_ Reserve balance to calculate weight against.
    /// @param valuation_ Valuation as ( market cap * price ) denominated in
    /// reserve to calculate a weight for.
    function valuationWeight(uint reserveBalance_, uint valuation_)
        public
        pure
        returns (uint)
    {
        uint weight_
            = ( valuation_ * IBalancerConstants.BONE ) / reserveBalance_;
        require(
            weight_ >= IBalancerConstants.MIN_WEIGHT,
            "MIN_WEIGHT_VALUATION"
        );
        // The combined weight of both tokens cannot exceed the maximum even
        // temporarily during a transaction so we need to subtract one for
        // headroom.
        require(
            ( IBalancerConstants.MAX_WEIGHT - IBalancerConstants.BONE )
            >= ( IBalancerConstants.MIN_WEIGHT + weight_ ),
            "MAX_WEIGHT_VALUATION"
        );
        return weight_;
    }

    /// Accessor for the `DistributionProgress` of this `Trust`.
    /// DEPRECATED: In the future this will be lifted offchain.
    function getDistributionProgress()
        external
        view
        returns(DistributionProgress memory)
    {
        Trust self_ = Trust(address(this));

        address balancerPool_ = address(self_.crp().bPool());
        uint poolReserveBalance_;
        uint poolTokenBalance_;
        if (balancerPool_ != address(0)) {
            poolReserveBalance_ = self_.reserve().balanceOf(balancerPool_);
            poolTokenBalance_ = self_.token().balanceOf(balancerPool_);
        }
        else {
            poolReserveBalance_ = 0;
            poolTokenBalance_ = 0;
        }

        return DistributionProgress(
            self_.getDistributionStatus(),
            self_.phaseBlocks(0),
            self_.phaseBlocks(1),
            poolReserveBalance_,
            poolTokenBalance_,
            self_.reserveInit(),
            self_.minimumCreatorRaise(),
            self_.seederFee(),
            self_.redeemInit()
        );
    }

    /// Accessor for the `DistributionStatus` of this `Trust`.
    /// Used by escrows to gauge whether the raise is active or complete, and
    /// if complete whether it is success or fail.
    /// It is important that once a raise reaches success/fail that it never
    /// reverts to active or changes its completion status.
    function getDistributionStatus()
        external
        view
        returns (DistributionStatus)
    {
        Trust self_ = Trust(address(this));

        Phase poolPhase_ = self_.currentPhase();
        if (poolPhase_ == Phase.ZERO) {
            if (
                self_.reserve().balanceOf(address(this)) >= self_.reserveInit()
            ) {
                return DistributionStatus.Seeded;
            } else {
                return DistributionStatus.Pending;
            }
        }
        else if (poolPhase_ == Phase.ONE) {
            return DistributionStatus.Trading;
        }
        else if (poolPhase_ == Phase.TWO) {
            return DistributionStatus.TradingCanEnd;
        }
        /// Phase.FOUR is emergency funds release mode, which ideally will
        /// never happen. If it does we still use the final/success balance to
        /// calculate success/failure so that the escrows can action their own
        /// fund releases.
        else if (poolPhase_ == Phase.THREE || poolPhase_ == Phase.FOUR) {
            if (self_.finalBalance() >= self_.successBalance()) {
                return DistributionStatus.Success;
            }
            else {
                return DistributionStatus.Fail;
            }
        }
        else {
            revert("UNKNOWN_POOL_PHASE");
        }
    }

    /// Allow anyone to start the Balancer style dutch auction.
    /// The auction won't start unless this contract owns enough of both the
    /// tokens for the pool, so it is safe for anon to call.
    /// `Phase.ZERO` indicates the auction can start.
    /// `Phase.ONE` indicates the auction has started.
    /// `Phase.TWO` indicates the auction can be ended.
    /// `Phase.THREE` indicates the auction has ended.
    /// Creates the pool via. the CRP contract and configures the weight change
    /// curve.
    /// The `Trust` MUST enforce this can only be called in `Phase.Zero`.
    /// The `Trust` MUST immediately schedule `Phase.ONE` upon calling this and
    /// schedule `Phase.TWO` to enable the auction to be ended.
    /// @param finalAuctionBlock_ After this block the CRP will reach its final
    /// weights and then `endDutchAuction` can be called.
    function startDutchAuction(uint finalAuctionBlock_)
        external
    {
        Trust self_ = Trust(address(this));

        // Define the weight curve.
        uint[] memory finalWeights_ = new uint[](2);
        finalWeights_[0] = IBalancerConstants.MIN_WEIGHT;
        finalWeights_[1] = self_.finalWeight();

        // Max pool tokens to minimise dust on exit.
        // No minimum weight change period.
        // No time lock (we handle our own locks in the trust).
        self_.crp().createPool(IBalancerConstants.MAX_POOL_SUPPLY, 0, 0);
        // Now that the bPool has a known address we need it to be a RECEIVER
        // as it is impossible in general for `ITier` restricted tokens to be
        // able to approve the pool itself. This ensures that token holders can
        // always sell back into the pool.
        // Note: We do NOT grant the bPool the SENDER role as that would bypass
        // `ITier` restrictions for everyone buying the token.
        self_.token().grantReceiver(
            self_.crp().bPool()
        );
        self_.crp().updateWeightsGradually(
            finalWeights_,
            block.number,
            finalAuctionBlock_
        );
    }

    /// Allow the owner to end the Balancer style dutch auction.
    /// Moves from `Phase.TWO` to `Phase.THREE` to indicate the auction has
    /// ended. The `Trust` MUST ensure this is only called in `Phase.TWO` and
    /// to immediately schedule `Phase.THREE`.
    /// `Phase.TWO` is scheduled by `startDutchAuction`.
    /// Removes all LP tokens from the Balancer pool.
    /// Burns all unsold redeemable tokens.
    /// Forwards the reserve balance to the owner.
    function endDutchAuction() external  {
        Trust self_ = Trust(address(this));

        IBPool pool_ = IBPool(self_.crp().bPool());

        // Ensure the bPool is aware of the real internal token balances.
        // Balancer will ignore tokens transferred to it until they are gulped.
        pool_.gulp(address(self_.reserve()));
        pool_.gulp(address(self_.token()));

        uint totalPoolTokens_ = IERC20(address(self_.crp())).totalSupply();

        // Balancer enforces a global minimum pool LP token supply as
        // `MIN_POOL_SUPPLY`.
        // Balancer also indirectly enforces local minimums on pool token
        // supply by enforcing minimum erc20 token balances in the pool.
        // The real minimum pool LP token supply is the largest of:
        // - The global minimum
        // - The LP token supply implied by the reserve
        // - The LP token supply implied by the token
        uint minReservePoolTokens = MIN_BALANCER_POOL_BALANCE
                .saturatingMul(totalPoolTokens_)
                // It's important to use the balance in the opinion of the
                // bPool to be sure that the pool token calculations are the
                // same.
                // WARNING: This will error if reserve balance in the pool is
                // somehow `0`. That should not be possible as balancer should
                // be preventing zero balance due to trades. If this ever
                // happens even emergency mode probably won't help because it's
                // unlikely that `exitPool` will succeed for any input values.
                / pool_.getBalance(address(self_.reserve()));
        // The minimum redeemable token supply is `10 ** 18` so it is near
        // impossible to hit this before the reserve or global pool minimums.
        uint minRedeemablePoolTokens = MIN_BALANCER_POOL_BALANCE
                .saturatingMul(totalPoolTokens_)
                // It's important to use the balance in the opinion of the
                // bPool tovbe sure that the pool token calculations are the
                // same.
                // WARNING: As above, this will error if token balance in the
                // pool is `0`.
                / pool_.getBalance(address(self_.token()));
        uint minPoolSupply_ = IBalancerConstants.MIN_POOL_SUPPLY
            .max(minReservePoolTokens)
            .max(minRedeemablePoolTokens)
            // Overcompensate for any rounding that could cause `exitPool` to
            // fail. This probably doesn't change anything because there are 9
            // OOMs between BONE and MAX_POOL_SUPPLY so `bdiv` will truncate
            // the precision a lot anyway.
            // Also `SmartPoolManager.exitPool` used internally by
            // `crp.exitPool` subtracts one so token amounts round down.
            + 1;

        uint finalBalance_ = self_.reserve().balanceOf(address(pool_));
        self_.setFinalBalance(finalBalance_);

        // This removes as much as is allowable which leaves behind some dust.
        // The reserve dust will be trapped.
        // The redeemable token will be burned when it moves to its own
        // `Phase.ONE`.
        self_.crp().exitPool(
            // Exit the maximum allowable pool tokens.
            totalPoolTokens_
                .saturatingSub(minPoolSupply_)
                // Don't attempt to exit more tokens than the `Trust` owns.
                // This SHOULD be the same as `totalPoolTokens_` so it's just
                // guarding against some bug or edge case.
                .min(IERC20(address(self_.crp())).balanceOf(address(this))),
            new uint[](2)
        );

        // Burn all unsold redeemable token inventory.
        self_.token().burn(self_.token().balanceOf(address(this)));

        // Burning the distributor moves the rTKN to its `Phase.ONE` and
        // unlocks redemptions.
        // The distributor is the `bPool` itself.
        self_.token().burnDistributor(address(pool_));

        // Balancer traps a tiny amount of reserve in the pool when it exits.
        uint poolDust_ = self_.reserve().balanceOf(address(pool_));

        // The dust is included in the final balance for UX reasons.
        // We don't want to fail the raise due to dust, even if technically it
        // was a failure.
        // To ensure a good UX for creators and token holders we subtract the
        // dust from the seeder.
        // The `availableBalance_` is the reserve the `Trust` owns and so can
        // safely transfer, despite dust etc.
        uint availableBalance_ = self_.reserve().balanceOf(address(this));

        // Base payments for each fundraiser.
        uint seederPay_ = self_.reserveInit().saturatingSub(poolDust_);
        uint creatorPay_ = 0;

        // Set aside the redemption and seed fee if we reached the minimum.
        // `Trust` must ensure that success balance covers seeder and token pay
        // in addition to creator minimum raise.
        if (finalBalance_ >= self_.successBalance()) {
            // The seeder gets an additional fee on success.
            seederPay_ = seederPay_.saturatingAdd(self_.seederFee());

            // The creators get new funds raised minus redeem and seed fees.
            // Implied is the remainder of finalBalance_ as redeemInit
            // This will be transferred to the token holders below.
            creatorPay_ = availableBalance_
                    .saturatingSub(
                        seederPay_.saturatingAdd(self_.redeemInit())
                    );
        }

        if (creatorPay_ > 0) {
            self_.reserve().safeApprove(
                self_.creator(),
                creatorPay_
            );
        }

        if (seederPay_ > 0) {
            self_.reserve().safeApprove(
                self_.seeder(),
                seederPay_
            );
        }

        // Approve everything left to the token holders.
        // Implicitly the remainder of the finalBalance_ is:
        // - the redeem init if successful
        // - whatever users deposited in the AMM if unsuccessful
        uint remainder_ = availableBalance_
            .saturatingSub(creatorPay_.saturatingAdd(seederPay_));
        if (remainder_ > 0) {
            self_.reserve().safeApprove(
                address(self_.token()),
                remainder_
            );
        }
    }

    /// Consumes all approvals from `endDutchAuction` as transfers. Any zero
    /// value approvals are a no-op. If this fails for some reason then each
    /// of the creator, seeder and redeemable token can individually consume
    /// their approvals fully or partially. By default this should be called
    /// atomically after `endDutchAuction`.
    /// `Trust` MUST ensure this is only called in `Phase.THREE` or above.
    function transferAuctionTokens() public {
        Trust self_ = Trust(address(this));

        IERC20 reserve_ = self_.reserve();
        IERC20 token_ = self_.token();
        address creator_ = self_.creator();
        address seeder_ = self_.seeder();

        uint creatorAllowance_ = reserve_.allowance(address(this), creator_);
        if (creatorAllowance_ > 0) {
            reserve_.safeTransfer(creator_, creatorAllowance_);
        }
        uint seederAllowance_ = reserve_.allowance(address(this), seeder_);
        if (seederAllowance_ > 0) {
            reserve_.safeTransfer(seeder_, seederAllowance_);
        }
        uint tokenAllowance_ = reserve_
            .allowance(address(this), address(token_));
        if (tokenAllowance_ > 0) {
            reserve_.safeTransfer(address(token_), tokenAllowance_);
        }
    }

    /// Anon can approve any amount of reserve, redeemable or CRP LP token for
    /// the creator to transfer to themselves. The `Trust` MUST ensure this is
    /// only callable during `Phase.FOUR` (emergency funds release phase).
    ///
    /// Tokens unknown to the `Trust` CANNOT be released in this way. We don't
    /// allow the `Trust` to call functions on arbitrary external contracts.
    ///
    /// Normally the `Trust` is NOT in emergency mode, and the creator cannot
    /// do anything to put the `Trust` into emergency mode other than wait for
    /// the timeout like everybody else. Normally anon will end the auction
    /// successfully long before emergency mode is possible.
    function creatorFundsRelease(address token_, uint amount_) external {
        Trust self_ = Trust(address(this));
        require(
            token_ == address(self_.reserve())
            || token_ == address(self_.token())
            || token_ == address(self_.crp()),
            "UNKNOWN_TOKEN"
        );
        IERC20(token_).safeIncreaseAllowance(self_.creator(), amount_);
    }
}