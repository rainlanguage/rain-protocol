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

import { RightsManager } from "./configurable-rights-pool/libraries/RightsManager.sol";
import { BalancerConstants } from "./configurable-rights-pool/libraries/BalancerConstants.sol";
import { ConfigurableRightsPool } from "./configurable-rights-pool/contracts/ConfigurableRightsPool.sol";
import { CRPFactory } from "./configurable-rights-pool/contracts/CRPFactory.sol";

contract TrustPool is Initable {

    bool[] rights;
    address[] pool_addresses;
    uint256[] pool_amounts;
    uint256[] pool_weights;

    ConfigurableRightsPool public crp_factory;

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
        pool_weights.push(BalancerConstants.MIN_WEIGHT);

        // The token weight is the ratio of pooled reserve to token supply.
        // Balancer hard caps the combined weight at 50.
        // If reserve weight + token weight > 50 the weights cannot rebalance.
        // Even if the weight would only go above 50 during a rebalance the operation will fail.
        uint256 _headroom = BalancerConstants.BONE;
        uint256 _desired_token_weight = SafeMath.mul(
            SafeMath.div(pool_amounts[1], pool_amounts[0]),
            pool_weights[0]
        );
        uint256 _achievable_token_weight = Math.min(
            SafeMath.sub(BalancerConstants.MAX_WEIGHT, _headroom),
            _desired_token_weight
        );
        console.log("Init pool weights: token: %s", _achievable_token_weight);
        pool_weights.push(_achievable_token_weight);

        return pool_weights;
    }

    function init_pool_fee () private onlyNotInit returns (uint256) {
        console.log("TrustPool: Init pool fee: %s", BalancerConstants.MIN_FEE);
        return BalancerConstants.MIN_FEE;
    }

    function init_pool_params(address _reserve_token, address _token, uint256 _reserve_token_amount) private onlyNotInit returns (ConfigurableRightsPool.PoolParams memory) {
        console.log("TrustPool: Init params: reserve: %s", _reserve_token);
        console.log("TrustPool: Init params: token: %s", _token);
        console.log("TrustPool: Init params: reserve amount: %s", _reserve_token_amount);
        return ConfigurableRightsPool.PoolParams(
            "TrustPool",
            "The Trust Pool",
            init_pool_addresses(_reserve_token, _token),
            init_pool_amounts(_reserve_token_amount, _token),
            init_pool_weights(),
            init_pool_fee()
        );
    }

    function init(
        address _reserve_token,
        address _token,
        uint256 _reserve_token_amount
    ) public withInit {
        console.log("TrustPool init: reserve: %s", _reserve_token);
        console.log("TrustPool init: token: %s", _token);
        console.log("TrustPool init: reserve amount: %s", _reserve_token_amount);

        require(IERC20(_reserve_token).allowance(msg.sender, address(this)) == _reserve_token_amount, "ERR_RESERVE_ALLOWANCE");
        require(IERC20(_token).allowance(msg.sender, address(this)) == IERC20(_token).totalSupply(), "ERR_TOKEN_ALLOWANCE");

        IERC20(_token).transferFrom(msg.sender, address(this), IERC20(_token).totalSupply());
        require(IERC20(_token).balanceOf(address(this)) == IERC20(_token).totalSupply(), "ERR_TOKEN_TRANSFER");

        crp_factory = CRPFactory(Constants.CRPFactory).newCrp(
            Constants.BFactory,
            init_pool_params(_reserve_token, _token, _reserve_token_amount),
            init_rights()
        );
    }

}