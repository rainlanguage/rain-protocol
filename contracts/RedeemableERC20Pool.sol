// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Math } from "@openzeppelin/contracts/math/Math.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { IBPool } from "./configurable-rights-pool/contracts/IBFactory.sol";
import { BPool } from "./configurable-rights-pool/contracts/test/BPool.sol";
import { RightsManager } from "./configurable-rights-pool/libraries/RightsManager.sol";
import { BalancerConstants } from "./configurable-rights-pool/libraries/BalancerConstants.sol";
import { ConfigurableRightsPool } from "./configurable-rights-pool/contracts/ConfigurableRightsPool.sol";
import { CRPFactory } from "./configurable-rights-pool/contracts/CRPFactory.sol";
import { BFactory } from "./configurable-rights-pool/contracts/test/BFactory.sol";

import { Phase, Phased } from "./Phased.sol";
import { RedeemableERC20 } from "./RedeemableERC20.sol";

/// Everything required to construct a `RedeemableERC20Pool`.
struct Config {
    // The CRPFactory on the current network.
    // This is an address published by Balancer or deployed locally during testing.
    CRPFactory crpFactory;
    // The BFactory on the current network.
    // This is an address published by Balancer or deployed locally during testing.
    BFactory balancerFactory;
    // The reserve erc20 token.
    // The reserve token anchors our newly minted redeemable tokens to an existant value system.
    // The weights and balances of the reserve token and the minted token define a dynamic spot price in the AMM.
    IERC20 reserve;
    // The newly minted redeemable token contract.
    // 100% of the total supply of the token MUST be transferred to the `RedeemableERC20Pool` for it to function.
    // This implies a 1:1 relationship between redeemable pools and tokens.
    // IMPORTANT: It is up to the caller to define a reserve that will remain functional and outlive the RedeemableERC20.
    // For example, USDC could freeze the tokens owned by the RedeemableERC20 contract or close their business.
    RedeemableERC20 token;
    // Amount of reserve token to initialize the pool.
    // The starting/final weights are calculated against this.
    uint256 reserveInit;
    // Initial marketcap of the token according to the balancer pool denominated in reserve token.
    // Th spot price of the token is ( market cap / token supply ) where market cap is defined in terms of the reserve.
    // The spot price of a balancer pool token is a function of both the amounts of each token and their weights.
    // This bonding curve is described in the balancer whitepaper.
    // We define a valuation of newly minted tokens in terms of the deposited reserve.
    // The reserve weight is set to the minimum allowable value to achieve maximum capital efficiency for the fund raising.
    uint256 initialValuation;
    // Final valuation is treated the same as initial valuation.
    // The final valuation will ONLY be achieved if NO TRADING OCCURS.
    // Any trading activity that net deposits reserve funds into the pool will increase the spot price permanently.
    uint256 finalValuation;
}

/// @title RedeemableERC20Pool
///
/// Deployer and controller for a Balancer ConfigurableRightsPool.
/// This contract is intended in turn to be owned by a `Trust`.
///
/// Responsibilities of `RedeemableERC20Pool`:
/// - Configure and deploy Balancer contracts with correct weights, rights and balances
/// - Allowing the owner to start and end a dutch auction raise modelled as Balancer's "gradual weights" functionality
/// - Tracking and enforcing 3 phases: unstarted, started, ended
/// - Burning unsold tokens after the raise and forwarding all raised and initial reserve back to the owner
///
/// Responsibilities of the owner:
/// - Providing all token and reserve balances
/// - Calling start and end raise functions
/// - Handling the reserve proceeds of the raise
contract RedeemableERC20Pool is Ownable, Phased {
    using SafeMath for uint256;
    using Math for uint256;
    using SafeERC20 for IERC20;
    using SafeERC20 for RedeemableERC20;

    /// Balancer requires a minimum balance of 10 ** 6 for all tokens at all times.
    uint256 public constant MIN_BALANCER_POOL_BALANCE = 10 ** 6;
    /// To ensure that the dust at the end of the raise is dust-like, we enfore a minimum starting reserve balance 100x the minimum.
    uint256 public constant MIN_RESERVE_INIT = 10 ** 8;

    /// RedeemableERC20 token.
    RedeemableERC20 public token;

    /// Reserve token.
    IERC20 public reserve;
    /// Initial reserve balance of the pool.
    uint256 public reserveInit;

    /// ConfigurableRightsPool built during construction.
    ConfigurableRightsPool public crp;

    /// The final weight on the last block of the raise.
    /// Note the spot price is unknown until the end because we don't know either of the final token balances.
    uint256 public finalWeight;

    /// @param config_ All configuration for the `RedeemableERC20Pool`.
    constructor (Config memory config_) public {
        require(config_.reserveInit >= MIN_RESERVE_INIT, "RESERVE_INIT_MINIMUM");

        token = config_.token;
        reserve = config_.reserve;
        reserveInit = config_.reserveInit;

        finalWeight = valuationWeight(config_.finalValuation);

        // Build the CRP.
        // The addresses in the RedeemableERC20Pool, as [reserve, token].
        address[] memory poolAddresses_ = new address[](2);
        poolAddresses_[0] = address(reserve);
        poolAddresses_[1] = address(token);

        uint256[] memory poolAmounts_ = new uint256[](2);
        poolAmounts_[0] = reserveInit;
        poolAmounts_[1] = token.totalSupply();
        require(poolAmounts_[1] > 0, "TOKEN_INIT_0");

        uint256[] memory initialWeights_ = new uint256[](2);
        initialWeights_[0] = BalancerConstants.MIN_WEIGHT;
        initialWeights_[1] = valuationWeight(config_.initialValuation);

        // 0. Pause
        // 1. Change fee
        // 2. Change weights (`true` needed to set gradual weight schedule)
        // 3. Add/remove tokens
        // 4. Whitelist LPs (default for `true` is nobody can joinPool)
        // 5. Change cap
        bool[] memory rights_ = new bool[](6);
        rights_[2] = true;
        rights_[4] = true;

        crp = config_.crpFactory.newCrp(
            address(config_.balancerFactory),
            ConfigurableRightsPool.PoolParams(
                "R20P",
                "RedeemableERC20Pool",
                poolAddresses_,
                poolAmounts_,
                initialWeights_,
                BalancerConstants.MIN_FEE
            ),
            RightsManager.constructRights(rights_)
        );

        // Preapprove all tokens and reserve for the CRP.
        require(config_.reserve.approve(address(crp), config_.reserveInit), "RESERVE_APPROVE");
        require(token.approve(address(crp), token.totalSupply()), "TOKEN_APPROVE");
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
    /// @param valuation_ Valuation as ( market cap * price ) denominated in reserve to calculate a weight for.
    function valuationWeight(uint256 valuation_) private view returns (uint256) {
        uint256 weight_ = valuation_.mul(BalancerConstants.BONE).div(reserveInit);
        require(weight_ >= BalancerConstants.MIN_WEIGHT, "MIN_WEIGHT_VALUATION");
        // The combined weight of both tokens cannot exceed the maximum even temporarily during a transaction so we need to subtract one for headroom.
        require(BalancerConstants.MAX_WEIGHT.sub(BalancerConstants.BONE) >= BalancerConstants.MIN_WEIGHT.add(weight_), "MAX_WEIGHT_VALUATION");
        return weight_;
    }

    /// Allow the owner to start the Balancer style dutch auction.
    /// `Phase.ZERO` indicates the auction can start.
    /// `Phase.ONE` indicates the auction has started.
    /// `Phase.TWO` indicates the auction can be ended.
    /// `Phase.THREE` indicates the auction has ended.
    /// Creates the pool via. the CRP contract and configures the weight change curve.
    /// @param finalAuctionBlock_ The last block that weights can dynamically decrease.
    function ownerStartDutchAuction(uint256 finalAuctionBlock_) external onlyOwner onlyPhase(Phase.ZERO) {
        // Move to Phase.ONE immediately.
        scheduleNextPhase(uint32(block.number));
        // Schedule Phase.TWO for 1 block after auctions weights have stopped changing.
        scheduleNextPhase(uint32(finalAuctionBlock_ + 1));

        // Define the weight curve.
        uint256[] memory finalWeights_ = new uint256[](2);
        finalWeights_[0] = BalancerConstants.MIN_WEIGHT;
        finalWeights_[1] = finalWeight;

        // Max pool tokens to minimise dust on exit.
        // No minimum weight change period.
        // No time lock (we handle our own locks in the trust).
        crp.createPool(BalancerConstants.MAX_POOL_SUPPLY, 0, 0);
        crp.updateWeightsGradually(finalWeights_, block.number, finalAuctionBlock_);
    }

    /// Allow the owner to end the Balancer style dutch auction.
    /// Moves from `Phase.TWO` to `Phase.THREE` to indicate the auction has ended.
    /// `Phase.TWO` is scheduled by `ownerStartDutchAuction`.
    /// Removes all LP tokens from the balancer pool.
    /// Burns all unsold redeemable tokens.
    /// Forwards the reserve balance to the owner.
    function ownerEndDutchAuction() external onlyOwner onlyPhase(Phase.TWO) {
        // Move to Phase.THREE immediately.
        // In Phase.THREE all `RedeemableERC20Pool` functions are no longer callable.
        scheduleNextPhase(uint32(block.number));

        // Balancer enforces a global minimum pool LP token supply as MIN_POOL_SUPPLY.
        // Balancer also indirectly enforces local minimums on pool token supply by enforcing minimum erc20 token balances in the pool.
        // The real minimum pool LP token supply is the largest of:
        // - The global minimum
        // - The LP token supply implied by the reserve
        // - The LP token supply implied by the token
        uint256 minReservePoolTokens = MIN_BALANCER_POOL_BALANCE.mul(BalancerConstants.MAX_POOL_SUPPLY).div(reserve.balanceOf(address(crp.bPool())));
        // The minimum redeemable token supply is 10 ** 18 so it is near impossible to hit this before the reserve or global pool minimums.
        uint256 minRedeemablePoolTokens = MIN_BALANCER_POOL_BALANCE.mul(BalancerConstants.MAX_POOL_SUPPLY).div(token.balanceOf(address(crp.bPool())));
        uint256 minPoolSupply_ = BalancerConstants.MIN_POOL_SUPPLY.max(minReservePoolTokens).max(minRedeemablePoolTokens);

        // It is not possible to destroy a Balancer pool completely with an exit afaik.
        // This removes as much as is allowable which leaves about 10^-7 of the supply behind as dust.
        crp.exitPool(
            crp.balanceOf(address(this)) - minPoolSupply_,
            new uint256[](2)
        );

        // Burn all unsold token inventory.
        token.burn(token.balanceOf(address(this)));

        // Send reserve back to owner (Trust) to be distributed to stakeholders.
        reserve.safeTransfer(
            owner(),
            reserve.balanceOf(address(this))
        );
    }

    /// Enforce Phase.THREE as the last phase.
    /// @inheritdoc Phased
    function _beforeScheduleNextPhase(uint32 nextPhaseBlock_) internal override virtual {
        super._beforeScheduleNextPhase(nextPhaseBlock_);
        assert(currentPhase() < Phase.THREE);
    }
}