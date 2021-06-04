// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import "hardhat/console.sol";

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
        RedeemableERC20 _token,
        PoolConfig memory _poolConfig,
        uint256 _redeemInit
    )
        public
    {
        // Calculate all the config for balancer.
        uint256[] memory _poolAmounts = poolAmounts(_token, _poolConfig);
        (uint256[] memory _startWeights, uint256[] memory _targetWeights) = poolWeights(_poolConfig, _redeemInit, _poolAmounts);
        ConfigurableRightsPool _crp = constructCrp(_token, _poolConfig, _poolAmounts, _startWeights);

        // Preapprove all tokens and reserve for the CRP.
        _poolConfig.reserve.approve(address(_crp), _poolConfig.reserveInit);
        _token.approve(address(_crp), _token.totalSupply());

        token = _token;
        reserve = _poolConfig.reserve;
        reserveInit = _poolConfig.reserveInit;
        crp = _crp;
        targetWeights = _targetWeights;
    }

    function poolAmounts (RedeemableERC20 _token, PoolConfig memory _poolConfig) private view returns (uint256[] memory) {
        uint256[] memory _poolAmounts = new uint256[](2);
        _poolAmounts[0] = _poolConfig.reserveInit;
        _poolAmounts[1] = _token.totalSupply();
        return _poolAmounts;
    }

    function poolWeights (PoolConfig memory _poolConfig, uint256 _redeemInit, uint256[] memory _poolAmounts) private pure returns (uint256[] memory, uint256[] memory) {
        // Spot = ( Br / Wr ) / ( Bt / Wt )
        // https://balancer.finance/whitepaper/
        // => ( Bt / Wt ) = ( Br / Wr ) / Spot
        // => Wt = ( Spot x Bt ) / ( Br / Wr )
        uint256 _reserveWeight = BalancerConstants.MIN_WEIGHT;
        uint256 _targetSpot = _poolConfig.initialValuation.mul(Constants.ONE).div(_poolAmounts[1]);
        uint256 _tokenWeight = _targetSpot.mul(_poolAmounts[1]).mul(Constants.ONE).div(
            _poolAmounts[0].mul(BalancerConstants.MIN_WEIGHT)
        );

        require(_tokenWeight >= BalancerConstants.MIN_WEIGHT, "ERR_MIN_WEIGHT");
        require(
            BalancerConstants.MAX_WEIGHT.sub(Constants.POOL_HEADROOM) >= _tokenWeight.add(_reserveWeight),
            "ERR_MAX_WEIGHT"
        );

        uint256[] memory _startWeights = new uint256[](2);
        _startWeights[0] = _reserveWeight;
        _startWeights[1] = _tokenWeight;

        // Target weights are the theoretical endpoint of updating gradually.
        // Since the pool starts with the full token supply this is the maximum possible dump.
        // We set the weight to the market cap of the redeem value.s
        uint256 _reserveWeightFinal = BalancerConstants.MIN_WEIGHT;
        uint256 _targetSpotFinal = _poolConfig.finalValuation.mul(Constants.ONE).div(_poolAmounts[1]);
        uint256 _tokenWeightFinal = _targetSpotFinal.mul(_poolAmounts[1]).mul(Constants.ONE).div(
                _redeemInit.mul(BalancerConstants.MIN_WEIGHT)
        );

        require(_tokenWeightFinal >= BalancerConstants.MIN_WEIGHT, "ERR_MIN_WEIGHT_FINAL");
        require(
            BalancerConstants.MAX_WEIGHT.sub(Constants.POOL_HEADROOM) >= _tokenWeightFinal.add(_reserveWeightFinal),
            "ERR_MAX_WEIGHT_FINAL"
        );

        uint256[] memory _targetWeights = new uint256[](2);
        _targetWeights[0] = _reserveWeightFinal;
        _targetWeights[1] = _tokenWeightFinal;

        return (_startWeights, _targetWeights);
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
        bool[] memory _rights = new bool[](6);
        _rights[0] = false;
        _rights[1] = false;
        _rights[2] = true;
        _rights[3] = true;
        _rights[4] = false;
        _rights[5] = false;
        return _rights;
    }

    function constructCrp (RedeemableERC20 _token, PoolConfig memory _poolConfig, uint256[] memory _poolAmounts, uint256[] memory _startWeights) private returns (ConfigurableRightsPool) {
        // The addresses in the RedeemableERC20Pool, as [reserve, token].
        address[] memory _poolAddresses = new address[](2);
        _poolAddresses[0] = address(_poolConfig.reserve);
        _poolAddresses[1] = address(_token);

        return _poolConfig.crpFactory.newCrp(
            address(_poolConfig.balancerFactory),
            ConfigurableRightsPool.PoolParams(
                "R20P",
                "RedeemableERC20Pool",
                _poolAddresses,
                _poolAmounts,
                _startWeights,
                // Fees do not make sense for us.
                // We exit and distribute fees via. the Trust NOT AMM mechanics.
                BalancerConstants.MIN_FEE
            ),
            RightsManager.constructRights(rights())
        );
    }

    function ownerSetUnblockBlock(uint256 _unblockBlock) external onlyOwner {
        setUnblockBlock(_unblockBlock);
    }

    function init(address seeder) external withInit onlyOwner onlyBlocked {
        // Take reserves from seeder.
        // The Trust should already have sent all the tokens to the pool.
        reserve.safeTransferFrom(
            seeder,
            address(this),
            reserveInit
        );

        // Max pool tokens to minimise dust on exit.
        // No minimum weight change period.
        // No time lock (we handle our own locks in the trust).
        ConfigurableRightsPool _crp = crp;
        _crp.createPool(BalancerConstants.MAX_POOL_SUPPLY, 0, 0);
        // Calculate the CRP curve.
        _crp.updateWeightsGradually(targetWeights, block.number, unblockBlock);
        pool = _crp.bPool();
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