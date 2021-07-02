// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { Initable } from "./libraries/Initable.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { BlockBlockable } from "./libraries/BlockBlockable.sol";
import { Math } from "@openzeppelin/contracts/math/Math.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { Constants } from "./libraries/Constants.sol";
import { RedeemableERC20 } from "./RedeemableERC20.sol";

import { IBPool } from "./configurable-rights-pool/contracts/IBFactory.sol";
import { BPool } from "./configurable-rights-pool/contracts/test/BPool.sol";
import { RightsManager } from "./configurable-rights-pool/libraries/RightsManager.sol";
import { BalancerConstants } from "./configurable-rights-pool/libraries/BalancerConstants.sol";
import { ConfigurableRightsPool } from "./configurable-rights-pool/contracts/ConfigurableRightsPool.sol";
import { CRPFactory } from "./configurable-rights-pool/contracts/CRPFactory.sol";
import { BFactory } from "./configurable-rights-pool/contracts/test/BFactory.sol";

struct PoolConfig {
    CRPFactory crpFactory;
    BFactory balancerFactory;
    IERC20 reserve;
    // Amount of reserve token to initialize the pool.
    // The starting/final weights are calculated against this.
    // This amount will be refunded to the Trust owner regardless whether the minRaise is met.
    uint256 reserveInit;
    // Initial marketcap of the token according to the balancer pool denominated in reserve token.
    // The spot price of a balancer pool token is a function of both the amounts of each token and their weights.
    // This differs to e.g. a uniswap pool where the weights are always 1:1.
    // So we can define a valuation of all our tokens in terms of the deposited reserve.
    // We also want to set the weight of the reserve small for flexibility, i.e. 1.
    // For example:
    // - 200 000 reserve tokens
    // - 1 000 000 token valuation
    // - Token spot price x total token = initial valuation => 1 000 000 = spot x 200 000 => spot = 5
    // - Spot price calculation is in balancer whitepaper: https://balancer.finance/whitepaper/
    // - Spot = ( Br / Wr ) / ( Bt / Wt )
    // - 5 = ( 50 000 / 1 ) / ( 200 000 / Wt ) => 50 000 x Wt = 1 000 000 => Wt = 20
    uint256 initialValuation;
    // Final market cap must be at least _redeemInit + _minRaise + seedFee.
    // The Trust enforces this invariant to avoid final prices that are too low for the sale to succeed.
    uint256 finalValuation;
    // Reserve can be any IERC20 token.
    // IMPORTANT: It is up to the caller to define a reserve that will remain functional and outlive the RedeemableERC20.
    // For example, USDC could freeze the tokens owned by the RedeemableERC20 contract or close their business.
    // In either case the redeem function would be pointing at a dangling reserve balance.
}

contract RedeemableERC20Pool is Ownable, Initable, BlockBlockable {

    using SafeMath for uint256;

    using SafeERC20 for IERC20;
    using SafeERC20 for RedeemableERC20;

    /// RedeemableERC20 token.
    RedeemableERC20 public token;

    /// Reserve token.
    IERC20 public reserve;
    uint256 public reserveInit;

    /// ConfigurableRightsPool.
    ConfigurableRightsPool public crp;

    /// @dev Internal weight accounting.
    ///      Used only and deleted by `init` to `updateWeightsGradually` at the same time as `setUnblockBlock`.
    uint256 private finalWeight;

    constructor (
        RedeemableERC20 token_,
        PoolConfig memory poolConfig_
    )
        public
    {
        token = token_;
        reserve = poolConfig_.reserve;

        require(poolConfig_.reserveInit > 0, "RESERVE_INIT_0");
        reserveInit = poolConfig_.reserveInit;

        finalWeight = valuationWeight(poolConfig_.finalValuation);

        // Build the CRP.
        // The addresses in the RedeemableERC20Pool, as [reserve, token].
        address[] memory poolAddresses_ = new address[](2);
        poolAddresses_[0] = address(poolConfig_.reserve);
        poolAddresses_[1] = address(token);

        uint256[] memory poolAmounts_ = new uint256[](2);
        poolAmounts_[0] = poolConfig_.reserveInit;
        poolAmounts_[1] = token.totalSupply();
        require(poolAmounts_[1] > 0, "TOKEN_INIT_0");

        uint256[] memory initialWeights_ = new uint256[](2);
        initialWeights_[0] = BalancerConstants.MIN_WEIGHT;
        initialWeights_[1] = valuationWeight(poolConfig_.initialValuation);

        // 0. Pause
        // 1. Change fee
        // 2. Change weights (`true` needed to set gradual weight schedule)
        // 3. Add/remove tokens
        // 4. Whitelist LPs (default for `true` is nobody can joinPool)
        // 5. Change cap
        bool[] memory rights_ = new bool[](6);
        rights_[2] = true;
        rights_[4] = true;

        crp = poolConfig_.crpFactory.newCrp(
            address(poolConfig_.balancerFactory),
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
        require(poolConfig_.reserve.approve(address(crp), poolConfig_.reserveInit), "RESERVE_APPROVE");
        require(token_.approve(address(crp), token_.totalSupply()), "TOKEN_APPROVE");
    }

    // https://balancer.finance/whitepaper/
    // Spot = ( Br / Wr ) / ( Bt / Wt )
    // => ( Bt / Wt ) = ( Br / Wr ) / Spot
    // => Wt = ( Spot x Bt ) / ( Br / Wr )
    //
    // Valuation = Spot * Token supply
    // Valuation / Supply = Spot
    // => Wt = ( ( Val / Supply ) x Bt ) / ( Br / Wr )
    //
    // Bt = Total supply
    // => Wt = ( ( Val / Bt) x Bt ) / ( Br / Wr )
    // => Wt = Val / ( Br / Wr )
    //
    // Wr = Min weight = 1
    // Wr = 1
    // => Wt = Val / Br
    //
    // Br = reserve init
    // => Wt = Val / reserve init
    function valuationWeight(uint256 valuation_) private view returns (uint256) {
        uint256 weight_ = valuation_.mul(Constants.ONE).div(reserveInit);
        require(weight_ >= BalancerConstants.MIN_WEIGHT, "MIN_WEIGHT_VALUATION");
        require(BalancerConstants.MAX_WEIGHT >= BalancerConstants.MIN_WEIGHT.add(weight_).add(Constants.POOL_HEADROOM), "MAX_WEIGHT_VALUATION");
        return weight_;
    }

    function init(uint256 unblockBlock_) external withInit onlyOwner onlyBlocked {
        // Set the first possible `exit` block.
        setUnblockBlock(unblockBlock_);

        // Define the weight curve.
        uint256[] memory finalWeights_ = new uint256[](2);
        finalWeights_[0] = BalancerConstants.MIN_WEIGHT;
        finalWeights_[1] = finalWeight;
        delete finalWeight;

        // Max pool tokens to minimise dust on exit.
        // No minimum weight change period.
        // No time lock (we handle our own locks in the trust).
        crp.createPool(BalancerConstants.MAX_POOL_SUPPLY, 0, 0);
        crp.updateWeightsGradually(finalWeights_, block.number, unblockBlock_);
    }

    function exit() external onlyInit onlyOwner onlyUnblocked {
        // It is not possible to destroy a Balancer pool completely with an exit (i think).
        // This removes as much as is allowable which leaves about 10^-7 of the supply behind as dust.
        crp.exitPool(
            crp.balanceOf(address(this)) - BalancerConstants.MIN_POOL_SUPPLY,
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

}