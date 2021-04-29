// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { console } from "hardhat/console.sol";
import { Initable } from "./libraries/Initable.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { BlockBlockable } from './libraries/BlockBlockable.sol';
import { Math } from "@openzeppelin/contracts/math/Math.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';

import { Constants } from "./libraries/Constants.sol";
import { RedeemableERC20 } from './RedeemableERC20.sol';

import { IBPool } from "./configurable-rights-pool/contracts/IBFactory.sol";
import { BPool } from "./configurable-rights-pool/contracts/test/BPool.sol";
import { RightsManager } from "./configurable-rights-pool/libraries/RightsManager.sol";
import { BalancerConstants } from "./configurable-rights-pool/libraries/BalancerConstants.sol";
import { ConfigurableRightsPool } from "./configurable-rights-pool/contracts/ConfigurableRightsPool.sol";
import { CRPFactory } from "./configurable-rights-pool/contracts/CRPFactory.sol";
import { BFactory } from './configurable-rights-pool/contracts/test/BFactory.sol';

contract RedeemableERC20Pool is Ownable, Initable, BlockBlockable {

    using SafeMath for uint256;

    using SafeERC20 for IERC20;

    // The amounts of each token at initialization as [reserve_amount, token_amount].
    // Balancer needs this to be a dynamic array but for us it is always length 2.
    uint256[] public pool_amounts;

    // The starting weights of the pool to produce the spot price as the target implied market cap.
    // Balancer needs this to be a dynamic array but for us it is always length 2.
    uint256[] public start_weights;

    // The target weights of the pool, as an implied market cap equal to the book value of redemption.
    // Balancer needs this to be a dynamic array but for us it is always length 2.
    uint256[] public target_weights;

    // The start block is set as the block number that init is called.
    // It defines the 'gradual' weight change curve as the start and end blocks.
    // The end block is the unblock_block copied from the redeemable token during init.
    uint256 public start_block;

    // RedeemableERC20 token.
    RedeemableERC20 public token;

    uint256 public reserve_init;
    uint256 public redeem_init;

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
    uint256 public initial_valuation;
    uint256 public final_valuation;

    CRPFactory public crp_factory;
    BFactory public balancer_factory;
    ConfigurableRightsPool public crp;
    IBPool public pool;


    constructor (
        CRPFactory _crp_factory,
        BFactory _balancer_factory,
        RedeemableERC20 _token,
        uint256 _reserve_init,
        uint256 _redeem_init,
        uint256 _initial_valuation,
        uint256 _final_valuation
    )
        public
    {
        crp_factory = _crp_factory;
        balancer_factory = _balancer_factory;
        token = _token;
        reserve_init = _reserve_init;
        redeem_init = _redeem_init;
        initial_valuation = _initial_valuation;
        final_valuation = _final_valuation;

        // These functions all mutate the dynamic arrays that Balancer expects.
        // We build these here because their values are set during bootstrap then are immutable.
        construct_pool_amounts();
        construct_pool_weights();
        construct_crp();
    }


    // The addresses in the RedeemableERC20Pool, as [reserve, token].
    function pool_addresses () public view returns (address[] memory) {

        address[] memory _pool_addresses = new address[](2);

        _pool_addresses[0] = address(token.reserve());
        _pool_addresses[1] = address(token);

        return _pool_addresses;
    }

    function construct_pool_amounts () private {
        pool_amounts.push(reserve_init);
        console.log("RedeemableERC20Pool: construct_pool_amounts: reserve_init: %s", pool_amounts[0]);

        // The token amount is always the total supply.
        // It is required that the pool initializes with full ownership of all Tokens in existence.
        pool_amounts.push(token.totalSupply());
        console.log("RedeemableERC20Pool: construct_pool_amounts: token: %s", pool_amounts[1]);
    }

    function construct_pool_weights () private {
        // This function requires that construct_pool_amounts be run prior.
        require(pool_amounts[0] > 0, "ERR_RESERVE_AMOUNT");
        require(pool_amounts[1] > 0, "ERR_TOKEN_AMOUNT");

        // Spot = ( Br / Wr ) / ( Bt / Wt )
        // https://balancer.finance/whitepaper/
        // => ( Bt / Wt ) = ( Br / Wr ) / Spot
        // => Wt = ( Spot x Bt ) / ( Br / Wr )
        uint256 _reserve_weight = BalancerConstants.MIN_WEIGHT;
        uint256 _target_spot = initial_valuation.mul(Constants.ONE).div(pool_amounts[1]);
        uint256 _token_weight = _target_spot.mul(pool_amounts[1]).mul(Constants.ONE).div(
            pool_amounts[0].mul(BalancerConstants.MIN_WEIGHT)
            );

        require(_token_weight >= BalancerConstants.MIN_WEIGHT, "ERR_MIN_WEIGHT");
        require(
            BalancerConstants.MAX_WEIGHT.sub(Constants.POOL_HEADROOM) >= _token_weight.add(_reserve_weight),
            "ERR_MAX_WEIGHT"
        );

        console.log("RedeemableERC20Pool: construct_pool_weights: weights: %s %s", _target_spot, _token_weight);
        console.log("RedeemableERC20Pool: construct_pool_weights: reserve_weight: %s", _reserve_weight);
        start_weights.push(_reserve_weight);
        start_weights.push(_token_weight);

        // Target weights are the theoretical endpoint of updating gradually.
        // Since the pool starts with the full token supply this is the maximum possible dump.
        // We set the weight to the market cap of the redeem value.

        uint256 _reserve_weight_final = BalancerConstants.MIN_WEIGHT;
        uint256 _target_spot_final = final_valuation.mul(Constants.ONE).div(pool_amounts[1]);
        uint256 _token_weight_final = _target_spot_final.mul(pool_amounts[1]).mul(Constants.ONE).div(
                redeem_init.mul(BalancerConstants.MIN_WEIGHT)
        );
        console.log("RedeemableERC20Pool: construct_pool_weights: weights_final: %s %s", _target_spot_final, _token_weight_final);
        console.log("RedeemableERC20Pool: construct_pool_weights: reserve_weight_final: %s", _reserve_weight_final);
        target_weights.push(_reserve_weight_final);
        target_weights.push(_token_weight_final);

        require(_token_weight_final >= BalancerConstants.MIN_WEIGHT, "ERR_MIN_WEIGHT_FINAL");
        require(
            BalancerConstants.MAX_WEIGHT.sub(Constants.POOL_HEADROOM) >= _token_weight_final.add(_reserve_weight_final),
            "ERR_MAX_WEIGHT_FINAL"
        );
    }

    // We are not here to make money off fees.
    // Set to the minimum balancer allows.
    function pool_fee () private pure returns (uint256) {
        return BalancerConstants.MIN_FEE;
    }

    // Construct the rights that will be used by the CRP.
    // These are hardcoded, we do NOT want any flexibility in our permissions.
    function rights() private pure returns (bool[] memory) {
        // The rights fo the RedeemableERC20Pool.
        // Balancer wants this to be a dynamic array even though it has fixed length.
        bool[] memory _rights = new bool[](6);

        // Pause
        _rights[0] = false;

        // Change fee
        _rights[1] = false;

        // Change weights (needed to set gradual weight schedule)
        _rights[2] = true;

        // Add/remove tokens (limited by this contract to the owner after unblock)
        _rights[3] = true;

        // Whitelist LPs (@todo limited by Trust?)
        _rights[4] = false;

        // Change cap
        _rights[5] = false;

        return _rights;
    }

    function construct_crp () private {
        // CRPFactory.
        crp = crp_factory.newCrp(
            address(balancer_factory),
            ConfigurableRightsPool.PoolParams(
                "R20P",
                "RedeemableERC20Pool",
                pool_addresses(),
                pool_amounts,
                start_weights,
                pool_fee()
            ),
            RightsManager.constructRights(rights())
        );
    }

    function init() public withInit onlyOwner onlyBlocked {
        // ensure allowances are set exactly.
        // allowances should NEVER be different to the pool amounts.
        console.log(
            "RedeemableERC20Pool: init: allowances: %s %s %s",
            pool_amounts[0],
            token.reserve().allowance(owner(), address(this)),
            token.allowance(owner(), address(this))
        );
        require(
            token.reserve().allowance(owner(), address(this)) == pool_amounts[0],
            'ERR_RESERVE_ALLOWANCE'
        );
        require(
            token.allowance(owner(), address(this)) == pool_amounts[1],
            'ERR_TOKEN_ALLOWANCE'
        );

        // take allocated reserves.
        console.log(
            "RedeemableERC20Pool: init: take reserves: %s",
            pool_amounts[0]
        );
        token.reserve().safeTransferFrom(
            owner(),
            address(this),
            pool_amounts[0]
        );
        // we do NOT require an exact balance of the reserve after xfer as someone other than the owner could grief the contract with reserve dust.
        require(
            token.reserve().balanceOf(address(this)) >= pool_amounts[0],
            'ERR_RESERVE_TRANSFER'
        );

        // take all token.
        console.log("RedeemableERC20Pool: init: take token: %s", pool_amounts[1]);
        require(token.transferFrom(
            owner(),
            address(this),
            pool_amounts[1]
        ),
        "ERR_TOKEN_TRANSFER");
        require(
            token.balanceOf(address(this)) == token.totalSupply(),
            'ERR_TOKEN_TRANSFER'
        );

        console.log(
            "RedeemableERC20Pool: init: balances: %s %s",
            token.reserve().balanceOf(address(this)),
            token.balanceOf(address(this))
        );

        token.reserve().approve(address(crp), pool_amounts[0]);
        token.approve(address(crp), pool_amounts[1]);

        crp.createPool(
            // No need for many pool tokens.
            BalancerConstants.MAX_POOL_SUPPLY,
            // No minimum weight change period.
            0,
            // No time lock (we handle our own locks in the trust).
            0
        );
        pool = crp.bPool();
        console.log(
            "RedeemableERC20Pool: pool tokens: %s",
            crp.balanceOf(address(this))
        );
        require(
            BalancerConstants.MAX_POOL_SUPPLY == crp.balanceOf(address(this)),
            "ERR_POOL_TOKENS"
        );

        // Double check the spot price is what we wanted.
        uint256 _target_spot = initial_valuation.mul(Constants.ONE).div(pool_amounts[1]);
        address[] memory _pool_addresses = pool_addresses();
        uint256 _actual_spot = BPool(address(crp.bPool())).getSpotPriceSansFee(
            _pool_addresses[0],
            _pool_addresses[1]
        );
        console.log(
            "RedeemableERC20Pool: init: spots %s %s",
            _target_spot,
            _actual_spot
        );
        require(
            _target_spot == _actual_spot,
            "ERR_SPOT_PRICE"
        );

        // Kick off the auction!
        start_block = block.number;
        crp.updateWeightsGradually(
            // Flip the weights
            target_weights,
            // From now
            start_block,
            // Until unlock
            token.unblock_block()
        );

        // Mirror the token unblock block.
        BlockBlockable.setUnblockBlock(token.unblock_block());
    }


    function exit() public onlyInit onlyOwner onlyUnblocked {
        console.log(
            "RedeemableERC20Pool: exit: %s %s",
            address(this),
            crp.balanceOf(address(this))
        );
        // It is not possible to destroy a Balancer pool completely with an exit (i think).
        // This removes as much as is allowable which leaves about 10^-7 of the supply behind as dust.
        crp.exitPool(
            crp.balanceOf(address(this)) - BalancerConstants.MIN_POOL_SUPPLY,
            new uint256[](2)
        );
        console.log(
            "RedeemableERC20Pool: exited: reserve: %s %s",
            pool_amounts[0],
            token.reserve().balanceOf(address(this))
        );
        console.log(
            "RedeemableERC20Pool: exited: token: %s %s",
            pool_amounts[1],
            token.balanceOf(address(this))
        );
        token.redeem(token.balanceOf(address(this)));
        console.log(
            "RedeemableERC20Pool: redeemed: reserve: %s %s",
            pool_amounts[0],
            token.reserve().balanceOf(address(this))
        );
        console.log(
            "RedeemableERC20Pool: redeemed: token: %s %s",
            pool_amounts[1],
            token.balanceOf(address(this))
        );

        token.reserve().safeTransfer(
            owner(),
            token.reserve().balanceOf(address(this))
        );
    }

}