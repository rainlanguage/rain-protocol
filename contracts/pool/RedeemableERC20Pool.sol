// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

// solhint-disable-next-line max-line-length
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { RainMath } from "../math/RainMath.sol";
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

/// Everything required to construct a `RedeemableERC20Pool`.
struct CRPConfig {
    // The CRPFactory on the current network.
    // This is an address published by Balancer or deployed locally during
    // testing.
    address crpFactory;
    // The BFactory on the current network.
    // This is an address published by Balancer or deployed locally during
    // testing.
    address balancerFactory;
    IERC20 reserve;
    RedeemableERC20 token;
    uint256 reserveInit;
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
    uint256 initialValuation;
}

/// @title RedeemableERC20Pool
/// @notice The Balancer functionality is wrapped by the
/// `RedeemableERC20Pool` contract.
///
/// Balancer pools require significant configuration so this contract helps
/// decouple the implementation from the `Trust`.
///
/// It also ensures the pool tokens created during the initialization of the
/// Balancer LBP are owned by the `RedeemableERC20Pool` and never touch either
/// the `Trust` nor an externally owned account (EOA).
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
/// @dev Deployer and controller for a Balancer ConfigurableRightsPool.
/// This contract is intended in turn to be owned by a `Trust`.
///
/// Responsibilities of `RedeemableERC20Pool`:
/// - Configure and deploy Balancer contracts with correct weights, rights and
///   balances
/// - Allowing the owner to start and end a dutch auction raise modelled as
///   Balancer's "gradual weights" functionality
/// - Tracking and enforcing 3 phases: unstarted, started, ended
/// - Burning unsold tokens after the raise and forwarding all raised and
///   initial reserve back to the owner
///
/// Responsibilities of the owner:
/// - Providing all token and reserve balances
/// - Calling start and end raise functions
/// - Handling the reserve proceeds of the raise
library RedeemableERC20Pool {
    using Math for uint256;
    using RainMath for uint256;
    using SafeERC20 for IERC20;
    using SafeERC20 for RedeemableERC20;

    event CreatorFundsRelease(address token, uint256 amount);

    /// Balancer requires a minimum balance of `10 ** 6` for all tokens at all
    /// times. ConfigurableRightsPool repo misreports this as 10 ** 12 but the
    /// Balancer Core repo has it set as `10 ** 6`. We add one here to protect
    /// ourselves against rounding issues.
    uint256 public constant MIN_BALANCER_POOL_BALANCE = 10 ** 6 + 1;
    /// To ensure that the dust at the end of the raise is dust-like, we
    /// enforce a minimum starting reserve balance 100x the minimum.
    uint256 public constant MIN_RESERVE_INIT = 10 ** 8;

    /// @param config_ All configuration for the `RedeemableERC20Pool`.
    // Slither false positive. Constructors cannot be reentrant.
    // https://github.com/crytic/slither/issues/887
    // slither-disable-next-line reentrancy-benign
    function setupCRP(Trust self_, CRPConfig memory config_)
        external
        returns (IConfigurableRightsPool)
    {
        // The addresses in the `RedeemableERC20Pool`, as `[reserve, token]`.
        address[] memory poolAddresses_ = new address[](2);
        poolAddresses_[0] = address(config_.reserve);
        poolAddresses_[1] = address(config_.token);

        uint256[] memory poolAmounts_ = new uint256[](2);
        poolAmounts_[0] = config_.reserveInit;
        poolAmounts_[1] = config_.token.totalSupply();
        require(poolAmounts_[1] > 0, "TOKEN_INIT_0");

        uint256[] memory initialWeights_ = new uint256[](2);
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
        config_.token.grantRole(
            config_.token.RECEIVER(),
            address(IConfigurableRightsPool(crp_).bFactory())
        );
        config_.token.grantRole(
            config_.token.RECEIVER(),
            crp_
        );
        config_.token.grantRole(
            config_.token.RECEIVER(),
            address(self_)
        );
        config_.token.grantRole(
            config_.token.SENDER(),
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
    /// Br = reserve init (assumes zero trading)
    /// => Wt = Val / reserve init
    /// @param valuation_ Valuation as ( market cap * price ) denominated in
    /// reserve to calculate a weight for.
    function valuationWeight(uint256 reserveInit_, uint256 valuation_)
        public
        pure
        returns (uint256)
    {
        uint256 weight_
            = ( valuation_ * IBalancerConstants.BONE ) / reserveInit_;
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
    function getDistributionProgress(Trust self_)
        external
        view
        returns(DistributionProgress memory)
    {
        address balancerPool_ = address(self_.crp().bPool());
        uint256 poolReserveBalance_;
        uint256 poolTokenBalance_;
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
    function getDistributionStatus(Trust self_)
        external
        view
        returns (DistributionStatus)
    {
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
    function startDutchAuction(Trust self_, uint256 finalAuctionBlock_)
        external
    {
        // Define the weight curve.
        uint256[] memory finalWeights_ = new uint256[](2);
        finalWeights_[0] = IBalancerConstants.MIN_WEIGHT;
        finalWeights_[1] = self_.finalWeight();

        // Max pool tokens to minimise dust on exit.
        // No minimum weight change period.
        // No time lock (we handle our own locks in the trust).
        self_.crp().createPool(IBalancerConstants.MAX_POOL_SUPPLY, 0, 0);
        // Now that the bPool has a known address we need it to be a RECEIVER
        // as it is impossible in general for `Tier` restricted tokens to be
        // able to approve the pool itself. This ensures that token holders can
        // always sell back into the pool.
        // Note: We do NOT grant the bPool the SENDER role as that would bypass
        // `Tier` restrictions for everyone buying the token.
        self_.token().grantRole(
            self_.token().RECEIVER(),
            self_.crp().bPool()
        );
        self_.token().renounceRole(
            self_.token().DEFAULT_ADMIN_ROLE(),
            address(this)
        );
        self_.crp().updateWeightsGradually(
            finalWeights_,
            block.number,
            finalAuctionBlock_
        );
    }

    /// Allow the owner to end the Balancer style dutch auction.
    /// Moves from `Phase.TWO` to `Phase.THREE` to indicate the auction has
    /// ended.
    /// `Phase.TWO` is scheduled by `startDutchAuction`.
    /// Removes all LP tokens from the Balancer pool.
    /// Burns all unsold redeemable tokens.
    /// Forwards the reserve balance to the owner.
    function endDutchAuction(Trust self_) external  {
        // Ensure the bPool is aware of the real internal token balances.
        // Balancer will ignore tokens transferred to it until they are gulped.
        IBPool(self_.crp().bPool()).gulp(address(self_.reserve()));
        IBPool(self_.crp().bPool()).gulp(address(self_.token()));

        uint256 totalPoolTokens_ = IERC20(address(self_.crp())).totalSupply();
        uint256 selfPoolTokens_ = IERC20(address(self_.crp()))
            .balanceOf(address(this));

        // Balancer enforces a global minimum pool LP token supply as
        // `MIN_POOL_SUPPLY`.
        // Balancer also indirectly enforces local minimums on pool token
        // supply by enforcing minimum erc20 token balances in the pool.
        // The real minimum pool LP token supply is the largest of:
        // - The global minimum
        // - The LP token supply implied by the reserve
        // - The LP token supply implied by the token
        uint256 minReservePoolTokens = MIN_BALANCER_POOL_BALANCE
                .saturatingMul(totalPoolTokens_)
                // It's important to use the balance in the opinion of the
                // bPool to be sure that the pool token calculations are the
                // same.
                .saturatingDiv(
                    IBPool(self_.crp().bPool())
                        .getBalance(address(self_.reserve()))
                );
        // The minimum redeemable token supply is `10 ** 18` so it is near
        // impossible to hit this before the reserve or global pool minimums.
        uint256 minRedeemablePoolTokens = MIN_BALANCER_POOL_BALANCE
                .saturatingMul(totalPoolTokens_)
                // It's important to use the balance in the opinion of the
                // bPool tovbe sure that the pool token calculations are the
                // same.
                .saturatingDiv(
                    IBPool(self_.crp().bPool())
                        .getBalance(address(self_.token()))
                );
        uint256 minPoolSupply_ = IBalancerConstants.MIN_POOL_SUPPLY
            .max(minReservePoolTokens)
            .max(minRedeemablePoolTokens)
            // Overcompensate for any rounding that could cause `exitPool` to
            // fail. This probably doesn't change anything because there are 9
            // OOMs between BONE and MAX_POOL_SUPPLY so `bdiv` will truncate
            // the precision a lot anyway.
            // Also `SmartPoolManager.exitPool` used internally by
            // `crp.exitPool` subtracts one so token amounts round down.
            + 1;

        uint256 finalBalance_ = self_.reserve()
            .balanceOf(address(self_.crp().bPool()));
        self_.setFinalBalance(finalBalance_);

        // This removes as much as is allowable which leaves behind some dust.
        // The reserve dust will be trapped.
        // The redeemable token will be burned when it moves to its own
        // `Phase.ONE`.
        self_.crp().exitPool(
            selfPoolTokens_.min(
                totalPoolTokens_.saturatingSub(minPoolSupply_)
            ),
            new uint256[](2)
        );

        // Burn all unsold token inventory.
        self_.token().burn(self_.token().balanceOf(address(this)));

        // Burning the distributor moves the token to its `Phase.ONE` and
        // unlocks redemptions.
        // The distributor is the `bPool` itself.
        // Requires that the `Trust` has been granted `ONLY_DISTRIBUTOR_BURNER`
        // role on the `redeemableERC20`.
        self_.token().burnDistributor(
            address(self_.crp().bPool())
        );

        // Balancer traps a tiny amount of reserve in the pool when it exits.
        uint256 poolDust_ = self_.reserve()
            .balanceOf(address(self_.crp().bPool()));
        // The dust is included in the final balance for UX reasons.
        // We don't want to fail the raise due to dust, even if technically it
        // was a failure.
        // To ensure a good UX for creators and token holders we subtract the
        // dust from the seeder.
        uint256 availableBalance_ = self_.reserve().balanceOf(address(this));

        // Base payments for each fundraiser.
        uint256 seederPay_ = self_.reserveInit().saturatingSub(poolDust_);
        uint256 creatorPay_ = 0;

        // Set aside the redemption and seed fee if we reached the minimum.
        if (finalBalance_ >= self_.successBalance()) {
            // The seeder gets an additional fee on success.
            seederPay_ = seederPay_.saturatingAdd(self_.seederFee());

            // The creators get new funds raised minus redeem and seed fees.
            // Can subtract without underflow due to the inequality check for
            // this code block.
            // Proof (assuming all positive integers):
            // final balance >= success balance
            // AND seed pay = seed init + seed fee
            // AND success = seed init + seed fee + token pay + min raise
            // SO success = seed pay + token pay + min raise
            // SO success >= seed pay + token pay
            // SO success - (seed pay + token pay) >= 0
            // SO final balance - (seed pay + token pay) >= 0
            //
            // Implied is the remainder of finalBalance_ as redeemInit
            // This will be transferred to the token holders below.
            creatorPay_ = availableBalance_
                    .saturatingSub(
                        seederPay_.saturatingAdd(self_.redeemInit())
                    );
        }

        if (creatorPay_ > 0) {
            self_.reserve().approve(
                self_.creator(),
                creatorPay_
            );
        }

        if (seederPay_ > 0) {
            self_.reserve().approve(
                self_.seeder(),
                seederPay_
            );
        }

        // Approve everything left to the token holders.
        // Implicitly the remainder of the finalBalance_ is:
        // - the redeem init if successful
        // - whatever users deposited in the AMM if unsuccessful
        uint256 remainder_ = availableBalance_
            .saturatingSub(creatorPay_.saturatingAdd(seederPay_));
        if (remainder_ > 0) {
            self_.reserve().approve(
                address(self_.token()),
                remainder_
            );
        }
    }

    function transferApprovedTokens(Trust self_) public {
        IERC20 reserve_ = self_.reserve();
        IERC20 token_ = self_.token();
        address creator_ = self_.creator();
        address seeder_ = self_.seeder();
        reserve_.safeTransfer(
            creator_,
            reserve_.allowance(address(this), creator_)
        );
        reserve_.safeTransfer(
            seeder_,
            reserve_.allowance(address(this), seeder_)
        );
        reserve_.safeTransfer(
            address(token_),
            reserve_.allowance(address(this), address(token_))
        );
    }

    function creatorFundsRelease(
        Trust self_,
        address token_,
        uint256 amount_
    )
        external
    {
        require(msg.sender == self_.creator(), "NON_CREATOR_RELEASE");
        // If the creator is asking for funds the `Trust` knows about and is
        // actively managing then we MUST ensure we've reached `Phase.FOUR`.
        if (
            token_ == address(self_.reserve())
            || token_ == address(self_.token())
            || token_ == address(self_.crp())
        ) {
            require(
                self_.currentPhase() == Phase.FOUR,
                "NON_RELEASE_PHASE"
            );
        }
        emit CreatorFundsRelease(token_, amount_);
        IERC20(token_).approve(msg.sender, amount_);
    }
}