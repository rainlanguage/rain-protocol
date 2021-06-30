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

    // RedeemableERC20 token.
    RedeemableERC20 public token;

    IERC20 public reserve;
    uint256 public reserveInit;
    uint256[] public targetWeights;

    ConfigurableRightsPool public crp;
    IBPool public pool;

    constructor (
        RedeemableERC20 token_,
        PoolConfig memory poolConfig_
    )
        public
    {
        // Calculate all the config for balancer.
        uint256[] memory poolAmounts_ = poolAmounts(token_, poolConfig_);
        (uint256[] memory startWeights_, uint256[] memory targetWeights_) = poolWeights(poolConfig_);
        ConfigurableRightsPool crp_ = constructCrp(token_, poolConfig_, poolAmounts_, startWeights_);

        // Preapprove all tokens and reserve for the CRP.
        require(poolConfig_.reserve.approve(address(crp_), poolConfig_.reserveInit), "RESERVE_APPROVE");
        require(token_.approve(address(crp_), token_.totalSupply()), "TOKEN_APPROVE");

        token = token_;
        reserve = poolConfig_.reserve;
        reserveInit = poolConfig_.reserveInit;
        crp = crp_;
        targetWeights = targetWeights_;
    }

    function poolAmounts (RedeemableERC20 token_, PoolConfig memory poolConfig_) private view returns (uint256[] memory) {
        uint256[] memory poolAmounts_ = new uint256[](2);
        require(poolConfig_.reserveInit > 0, "RESERVE_INIT_0");
        poolAmounts_[0] = poolConfig_.reserveInit;
        poolAmounts_[1] = token_.totalSupply();
        require(poolAmounts_[1] > 0, "TOKEN_INIT_0");
        return poolAmounts_;
    }

    function poolWeights (PoolConfig memory poolConfig_) private pure returns (uint256[] memory, uint256[] memory) {
        // https://balancer.finance/whitepaper/
        // Spot = ( Br / Wr ) / ( Bt / Wt )
        // => ( Bt / Wt ) = ( Br / Wr ) / Spot
        // => Wt = ( Spot x Bt ) / ( Br / Wr )
        //
        // Initial Valuation = Spot * Token supply
        // IV / Supply = Spot
        // => Wt = ( ( IV / Supply ) x Bt ) / ( Br / Wr )
        //
        // Bt = Total supply
        // => Wt = ( ( IV / Bt) x Bt ) / ( Br / Wr )
        // => Wt = IV / ( Br / Wr )
        //
        // Wr = Min weight = 1
        // Wr = 1
        // => Wt = IV / Br
        //
        // Br = reserve init
        // => Wt = IV / reserve init
        uint256[] memory initialWeights_ = new uint256[](2);
        initialWeights_[0] = BalancerConstants.MIN_WEIGHT;
        initialWeights_[1] = poolConfig_.initialValuation.mul(Constants.ONE).div(poolConfig_.reserveInit);

        require(initialWeights_[1] >= BalancerConstants.MIN_WEIGHT, "MIN_WEIGHT_INITIAL");
        require(BalancerConstants.MAX_WEIGHT >= initialWeights_[0].add(initialWeights_[1]).add(Constants.POOL_HEADROOM), "MAX_WEIGHT_INITIAL");

        // Target weights are the theoretical endpoint of updating gradually.
        // Since the pool starts with the full token supply this is the maximum possible dump.
        // As we are guarding against the worst case (zero participation):
        // Bt = total supply
        // Br = reserve init
        // Wr = same as the start
        //
        // Everything is as above but with the final valuation instead of the initial valuation.
        uint256[] memory finalWeights_ = new uint256[](2);
        finalWeights_[0] = BalancerConstants.MIN_WEIGHT;
        finalWeights_[1] = poolConfig_.finalValuation.mul(Constants.ONE).div(poolConfig_.reserveInit);

        require(finalWeights_[1] >= BalancerConstants.MIN_WEIGHT, "MIN_WEIGHT_FINAL");
        require(BalancerConstants.MAX_WEIGHT >= finalWeights_[0].add(finalWeights_[1]).add(Constants.POOL_HEADROOM), "MAX_WEIGHT_FINAL");

        return (initialWeights_, finalWeights_);
    }

    // Construct the rights that will be used by the CRP.
    // These are hardcoded, we do NOT want any flexibility in our permissions.
    function rights() private pure returns (bool[] memory) {
        // 0. Pause
        // 1. Change fee
        // 2. Change weights (needed to set gradual weight schedule)
        // 3. Add/remove tokens (limited by this contract to the owner after unblock)
        // 4. Whitelist LPs (@todo limited by Trust?)
        // 5. Change cap
        bool[] memory rights_ = new bool[](6);
        rights_[0] = false;
        rights_[1] = false;
        rights_[2] = true;
        rights_[3] = true;
        rights_[4] = false;
        rights_[5] = false;
        return rights_;
    }

    function constructCrp (RedeemableERC20 token_, PoolConfig memory poolConfig_, uint256[] memory poolAmounts_, uint256[] memory startWeights_) private returns (ConfigurableRightsPool) {
        // The addresses in the RedeemableERC20Pool, as [reserve, token].
        address[] memory poolAddresses_ = new address[](2);
        poolAddresses_[0] = address(poolConfig_.reserve);
        poolAddresses_[1] = address(token_);

        return poolConfig_.crpFactory.newCrp(
            address(poolConfig_.balancerFactory),
            ConfigurableRightsPool.PoolParams(
                "R20P",
                "RedeemableERC20Pool",
                poolAddresses_,
                poolAmounts_,
                startWeights_,
                // Fees do not make sense for us.
                // We exit and distribute fees via. the Trust NOT AMM mechanics.
                BalancerConstants.MIN_FEE
            ),
            RightsManager.constructRights(rights())
        );
    }

    function ownerSetUnblockBlock(uint256 unblockBlock_) external onlyOwner {
        setUnblockBlock(unblockBlock_);
    }

    function init() external withInit onlyOwner onlyBlocked {
        // Max pool tokens to minimise dust on exit.
        // No minimum weight change period.
        // No time lock (we handle our own locks in the trust).
        crp.createPool(BalancerConstants.MAX_POOL_SUPPLY, 0, 0);
        // Calculate the CRP curve.
        crp.updateWeightsGradually(targetWeights, block.number, unblockBlock);
        pool = crp.bPool();
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