// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { console } from "hardhat/console.sol";
import { Initable } from "./libraries/Initable.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { Math } from "@openzeppelin/contracts/math/Math.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { Constants } from "./libraries/Constants.sol";

import { IBPool } from "./configurable-rights-pool/contracts/IBFactory.sol";
import { RightsManager } from "./configurable-rights-pool/libraries/RightsManager.sol";
import { BalancerConstants } from "./configurable-rights-pool/libraries/BalancerConstants.sol";
import { ConfigurableRightsPool } from "./configurable-rights-pool/contracts/ConfigurableRightsPool.sol";
import { CRPFactory } from "./configurable-rights-pool/contracts/CRPFactory.sol";

contract TrustPool is Initable {

    // Everything publicly visible because we have nothing to hide.

    // The rights fo the TrustPool.
    bool[] public rights;

    // The addresses in the TrustPool, as [reserve, token].
    address[] public pool_addresses;

    // The amounts of each token at initialization as [reserve_amount, token_amount].
    uint256[] public pool_amounts;

    // The starting weights of the pool as [min, token/reserve].
    uint256[] public start_weights;

    // The target weights of the pool, as the inverse of the start weights.
    uint256[] public target_weights;

    // The start block is set as the block number that init is called.
    uint256 public start_block;

    // The unlock block is set in the constructor and determines:
    // - The redeemer unlock
    // - The ability to withdraw pool tokens
    // - The auction schedule
    uint256 public unlock_block;

    address public reserve;
    address public token;
    uint256 public reserve_amount;

    ConfigurableRightsPool public crp;
    IBPool public pool;

    constructor (
        address _reserve,
        address _token,
        uint256 _reserve_amount,
        uint256 _unlock_block
    ) public {
        reserve = _reserve;
        token = _token;
        unlock_block = _unlock_block;
        reserve_amount = _reserve_amount;
    }

    function init_rights() private onlyNotInit returns (RightsManager.Rights memory) {
        // Pause
        rights.push(false);

        // Change fee
        rights.push(false);

        // Change weights (needed to set gradual weight schedule)
        rights.push(true);

        // Add/remove tokens (limited by Trust)
        rights.push(true);

        // Whitelist LPs (@todo limited by Trust?)
        rights.push(false);

        // Change cap
        rights.push(false);

        return RightsManager.constructRights(rights);
    }

    function init_pool_addresses (
        address _reserve_token,
        address _token
    ) private onlyNotInit returns (address[] storage) {
        console.log("Init pool addresses: reserve: %s", _reserve_token);
        console.log("Init pool addresses: token: %s", _token);

        pool_addresses.push(_reserve_token);
        pool_addresses.push(_token);

        return pool_addresses;
    }

    function init_pool_amounts (
        uint256 _reserve_amount,
        address _token
    ) private onlyNotInit returns (uint256[] storage) {
        // The reserve amount is exactly what is passed in to the function.
        console.log("Init pool amounts: reserve: %s", _reserve_amount);
        pool_amounts.push(_reserve_amount);

        // The token amount is the full balance of the TrustPool.
        // It is required that the TrustPool initializes with full ownership of all Tokens in existence.
        uint256 _token_supply = IERC20(_token).totalSupply();
        require(IERC20(_token).balanceOf(address(this)) == _token_supply, "ERR_TOKEN_BALANCE");
        console.log("Init pool amounts: token: %s", _token_supply);
        pool_amounts.push(_token_supply);

        return pool_amounts;
    }

    function init_pool_weights () private onlyNotInit returns (uint256[] storage) {
        // This function requires that init_pool_amounts be run prior.
        require(pool_amounts[0] > 0, "ERR_RESERVE_AMOUNT");
        require(pool_amounts[1] > 0, "ERR_TOKEN_AMOUNT");

        // The reserve weight is as small as we can make it.
        // The goal is to distribute tokens.
        console.log("Init pool weights: reserve: %s", BalancerConstants.MIN_WEIGHT);
        start_weights.push(BalancerConstants.MIN_WEIGHT);

        // The token weight is the ratio of pooled reserve to token supply.
        // Balancer hard caps the combined weight at 50.
        // If reserve weight + token weight > 50 the weights cannot rebalance.
        // Even if the weight would only go above 50 during a rebalance the operation will fail.
        uint256 _headroom = BalancerConstants.BONE;
        uint256 _desired_token_weight = SafeMath.mul(
            SafeMath.div(pool_amounts[1], pool_amounts[0]),
            start_weights[0]
        );
        uint256 _achievable_token_weight = Math.min(
            SafeMath.sub(BalancerConstants.MAX_WEIGHT, _headroom),
            _desired_token_weight
        );
        console.log("Init pool weights: token: %s", _achievable_token_weight);
        start_weights.push(_achievable_token_weight);

        // Target weights are the theoretical endpoint of updating gradually.
        // We simply flip the starting ratios because why not?
        target_weights.push(start_weights[1]);
        target_weights.push(start_weights[0]);
        require(target_weights[0] == start_weights[1], "ERR_TARGET_WEIGHT_0");
        require(target_weights[1] == start_weights[0], "ERR_TARGET_WEIGHT_1");

        return start_weights;
    }

    function init_pool_fee () private view onlyNotInit returns (uint256) {
        console.log("TrustPool: Init pool fee: %s", BalancerConstants.MIN_FEE);
        return BalancerConstants.MIN_FEE;
    }

    function init_pool_params(address _reserve, address _token, uint256 _reserve_amount) private onlyNotInit returns (ConfigurableRightsPool.PoolParams memory) {
        console.log("TrustPool: Init params: reserve: %s", _reserve);
        console.log("TrustPool: Init params: token: %s", _token);
        console.log("TrustPool: Init params: reserve amount: %s", _reserve_amount);
        return ConfigurableRightsPool.PoolParams(
            "TrustPool",
            "The Trust Pool",
            init_pool_addresses(_reserve, _token),
            init_pool_amounts(_reserve_amount, _token),
            init_pool_weights(),
            init_pool_fee()
        );
    }

    function init() public withInit {
        console.log("TrustPool init: reserve: %s", reserve);
        console.log("TrustPool init: token: %s", token);
        console.log("TrustPool init: reserve amount: %s", reserve_amount);

        // Ensure the caller set their allowances correctly.
        require(IERC20(reserve).allowance(msg.sender, address(this)) == reserve_amount, "ERR_RESERVE_ALLOWANCE");
        require(IERC20(token).allowance(msg.sender, address(this)) == IERC20(token).totalSupply(), "ERR_TOKEN_ALLOWANCE");

        // Take full ownership of the token supply.
        IERC20(token).transferFrom(msg.sender, address(this), IERC20(token).totalSupply());
        require(IERC20(token).balanceOf(address(this)) == IERC20(token).totalSupply(), "ERR_TOKEN_TRANSFER");

        // Take ownership of the allocated reserves.
        IERC20(reserve).transferFrom(msg.sender, address(this), reserve_amount);
        require(IERC20(reserve).balanceOf(address(this)) == reserve_amount, "ERR_RESERVE_TRANSFER");

        // Build a CRPFactory.
        crp = CRPFactory(Constants.CRPFactory).newCrp(
            Constants.BFactory,
            init_pool_params(reserve, token, reserve_amount),
            init_rights()
        );

        // Mint the pool token.
        // As small as possible because we don't trade/distribute/divide the pool tokens.
        IERC20(token).approve(address(crp), IERC20(token).totalSupply());
        IERC20(reserve).approve(address(crp), reserve_amount);
        ConfigurableRightsPool(crp).createPool(
            BalancerConstants.MIN_POOL_SUPPLY,
            // No minimum weight change period.
            0,
            // No time lock (we handle our own locks in the trust).
            0
        );
        pool = crp.bPool();

        // Kick off the auction!
        start_block = block.number;
        crp.updateWeightsGradually(
            // Flip the weights
            target_weights,
            // From now
            start_block,
            // Until unlock
            unlock_block
        );
    }

}