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
    // Amount of reserve token to initialize the pool.
    // The starting/final weights are calculated against this.
    // This amount will be refunded to the Trust owner regardless whether the minRaise is met.
    uint256 reserveInit;
}

contract RedeemableERC20Pool is Ownable, Initable, BlockBlockable {

    using SafeMath for uint256;

    using SafeERC20 for IERC20;

    // The amounts of each token at initialization as [reserve_amount, token_amount].
    // Balancer needs this to be a dynamic array but for us it is always length 2.
    uint256[] public poolAmounts;

    // The starting weights of the pool to produce the spot price as the target implied market cap.
    // Balancer needs this to be a dynamic array but for us it is always length 2.
    uint256[] public startWeights;

    // The target weights of the pool, as an implied market cap equal to the book value of redemption.
    // Balancer needs this to be a dynamic array but for us it is always length 2.
    uint256[] public targetWeights;

    // The start block is set as the block number that init is called.
    // It defines the 'gradual' weight change curve as the start and end blocks.
    // The end block is the unblockBlock copied from the redeemable token during init.
    uint256 public startBlock;

    // RedeemableERC20 token.
    RedeemableERC20 public token;

    uint256 public reserveInit;
    uint256 public redeemInit;

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
    uint256 public initialValuation;
    uint256 public finalValuation;

    ConfigurableRightsPool public crp;
    IBPool public pool;

    constructor (
        PoolConfig memory _poolConfig,
        RedeemableERC20 _token,
        uint256 _redeemInit,
        uint256 _initialValuation,
        uint256 _finalValuation
    )
        public
    {
        token = _token;
        reserveInit = _poolConfig.reserveInit;
        redeemInit = _redeemInit;
        initialValuation = _initialValuation;
        finalValuation = _finalValuation;

        // These functions all mutate the dynamic arrays that Balancer expects.
        // We build these here because their values are set during bootstrap then are immutable.
        constructPoolAmounts();
        constructPoolWeights();
        constructCrp(_poolConfig);
    }

    // The addresses in the RedeemableERC20Pool, as [reserve, token].
    function poolAddresses () public view returns (address[] memory) {

        address[] memory _poolAddresses = new address[](2);

        _poolAddresses[0] = address(token.reserve());
        _poolAddresses[1] = address(token);

        return _poolAddresses;
    }

    function constructPoolAmounts () private {
        poolAmounts.push(reserveInit);

        // The token amount is always the total supply.
        // It is required that the pool initializes with full ownership of all Tokens in existence.
        poolAmounts.push(token.totalSupply());
    }

    function constructPoolWeights () private {
        // This function requires that constructPoolAmounts be run prior.
        require(poolAmounts[0] > 0, "ERR_RESERVE_AMOUNT");
        require(poolAmounts[1] > 0, "ERR_TOKEN_AMOUNT");

        // Spot = ( Br / Wr ) / ( Bt / Wt )
        // https://balancer.finance/whitepaper/
        // => ( Bt / Wt ) = ( Br / Wr ) / Spot
        // => Wt = ( Spot x Bt ) / ( Br / Wr )
        uint256 _reserveWeight = BalancerConstants.MIN_WEIGHT;
        uint256 _targetSpot = initialValuation.mul(Constants.ONE).div(poolAmounts[1]);
        uint256 _tokenWeight = _targetSpot.mul(poolAmounts[1]).mul(Constants.ONE).div(
            poolAmounts[0].mul(BalancerConstants.MIN_WEIGHT)
            );

        require(_tokenWeight >= BalancerConstants.MIN_WEIGHT, "ERR_MIN_WEIGHT");
        require(
            BalancerConstants.MAX_WEIGHT.sub(Constants.POOL_HEADROOM) >= _tokenWeight.add(_reserveWeight),
            "ERR_MAX_WEIGHT"
        );

        startWeights.push(_reserveWeight);
        startWeights.push(_tokenWeight);

        // Target weights are the theoretical endpoint of updating gradually.
        // Since the pool starts with the full token supply this is the maximum possible dump.
        // We set the weight to the market cap of the redeem value.

        uint256 _reserveWeightFinal = BalancerConstants.MIN_WEIGHT;
        uint256 _targetSpotFinal = finalValuation.mul(Constants.ONE).div(poolAmounts[1]);
        uint256 _tokenWeightFinal = _targetSpotFinal.mul(poolAmounts[1]).mul(Constants.ONE).div(
                redeemInit.mul(BalancerConstants.MIN_WEIGHT)
        );
        targetWeights.push(_reserveWeightFinal);
        targetWeights.push(_tokenWeightFinal);

        require(_tokenWeightFinal >= BalancerConstants.MIN_WEIGHT, "ERR_MIN_WEIGHT_FINAL");
        require(
            BalancerConstants.MAX_WEIGHT.sub(Constants.POOL_HEADROOM) >= _tokenWeightFinal.add(_reserveWeightFinal),
            "ERR_MAX_WEIGHT_FINAL"
        );
    }

    // We are not here to make money off fees.
    // Set to the minimum balancer allows.
    function poolFee () private pure returns (uint256) {
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

    function constructCrp (PoolConfig memory _poolConfig) private {
        // CRPFactory.
        crp = _poolConfig.crpFactory.newCrp(
            address(_poolConfig.balancerFactory),
            ConfigurableRightsPool.PoolParams(
                "R20P",
                "RedeemableERC20Pool",
                poolAddresses(),
                poolAmounts,
                startWeights,
                poolFee()
            ),
            RightsManager.constructRights(rights())
        );
    }

    function init() public withInit onlyOwner onlyBlocked {
        // ensure allowances are set exactly.
        // allowances should NEVER be different to the pool amounts.
        require(
            token.reserve().allowance(owner(), address(this)) == poolAmounts[0],
            "ERR_RESERVE_ALLOWANCE"
        );
        require(
            token.allowance(owner(), address(this)) == poolAmounts[1],
            "ERR_TOKEN_ALLOWANCE"
        );

        // take allocated reserves.
        token.reserve().safeTransferFrom(
            owner(),
            address(this),
            poolAmounts[0]
        );
        // we do NOT require an exact balance of the reserve after xfer as someone other than the owner could grief the contract with reserve dust.
        require(
            token.reserve().balanceOf(address(this)) >= poolAmounts[0],
            "ERR_RESERVE_TRANSFER"
        );

        // take all token.
        require(token.transferFrom(
            owner(),
            address(this),
            poolAmounts[1]
        ),
        "ERR_TOKEN_TRANSFER");
        require(
            token.balanceOf(address(this)) == token.totalSupply(),
            "ERR_TOKEN_TRANSFER"
        );

        token.reserve().approve(address(crp), poolAmounts[0]);
        token.approve(address(crp), poolAmounts[1]);

        crp.createPool(
            // No need for many pool tokens.
            BalancerConstants.MAX_POOL_SUPPLY,
            // No minimum weight change period.
            0,
            // No time lock (we handle our own locks in the trust).
            0
        );
        pool = crp.bPool();
        require(
            BalancerConstants.MAX_POOL_SUPPLY == crp.balanceOf(address(this)),
            "ERR_POOL_TOKENS"
        );

        // Double check the spot price is what we wanted.
        uint256 _targetSpot = initialValuation.mul(Constants.ONE).div(poolAmounts[1]);
        address[] memory _poolAddresses = poolAddresses();
        uint256 _actualSpot = BPool(address(crp.bPool())).getSpotPriceSansFee(
            _poolAddresses[0],
            _poolAddresses[1]
        );
        require(
            _targetSpot == _actualSpot,
            "ERR_SPOT_PRICE"
        );

        // Kick off the auction!
        startBlock = block.number;
        crp.updateWeightsGradually(
            // Flip the weights
            targetWeights,
            // From now
            startBlock,
            // Until unlock
            token.unblockBlock()
        );

        // Mirror the token unblock block.
        BlockBlockable.setUnblockBlock(token.unblockBlock());
    }

    function exit() public onlyInit onlyOwner onlyUnblocked {
        // It is not possible to destroy a Balancer pool completely with an exit (i think).
        // This removes as much as is allowable which leaves about 10^-7 of the supply behind as dust.
        crp.exitPool(
            crp.balanceOf(address(this)) - BalancerConstants.MIN_POOL_SUPPLY,
            new uint256[](2)
        );
        token.redeem(token.balanceOf(address(this)));
        token.reserve().safeTransfer(
            owner(),
            token.reserve().balanceOf(address(this))
        );
    }

}