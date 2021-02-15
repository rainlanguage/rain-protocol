// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

// Needed to handle structures externally
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol" as ERC20;
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "hardhat/console.sol";

import "./configurable-rights-pool/libraries/BalancerConstants.sol";
import "./configurable-rights-pool/libraries/RightsManager.sol" as RightsManager;
import "./configurable-rights-pool/contracts/ConfigurableRightsPool.sol" as ConfigurableRightsPool;
import './configurable-rights-pool/contracts/CRPFactory.sol' as CRPFactory;

import "./libraries/Constants.sol";
import './libraries/Initable.sol';
import { RedeemableToken } from "./RedeemableToken.sol";
import "./TrustToken.sol" as TrustToken;

contract Trust is Ownable, Initable {

    using SafeMath for uint256;

    // Type declarations

    // Used to logically bundle the token constructor parameters.
    struct TokenDefinition {
        // Normalized initialSupply
        // e.g. 1 = 1 token with 18 decimal places
        // i.e. internally we multiply by 10 ** 18 to handle standard decimals
        uint256 initialSupply;
        // Name of the new token to create.
        string name;
        // Symbol of the new token to create.
        string symbol;
    }

    struct ReserveDeposit {
        // Address of the reserve token.
        ERC20.ERC20 reserveToken;
        // Amount of the reserve token to lock up.
        uint256 lockedAmount;
        // Amount of the reserve token to add to pool.
        uint256 poolAmount;
    }

    ERC20.ERC20 public reserve_token;
    TrustToken.TrustToken public token;
    RedeemableToken public redeemable_token;
    ConfigurableRightsPool.ConfigurableRightsPool public pool;

    function init(
        TokenDefinition memory,
        ReserveDeposit memory _reserve_deposit,
        uint256
    ) public onlyOwner withInit {
        // console.log("Trust init: %s", address(this));

        // token = new TrustToken.TrustToken(
        //     _token_definition.initialSupply.mul(BalancerConstants.BONE),
        //     _token_definition.name,
        //     _token_definition.symbol
        // );

        // reserve_token = _reserve_deposit.reserveToken;

        // console.log("Trust init: TrustToken: address: %s", address(token));
        // console.log("Trust init: TrustToken: name: %s", token.name());
        // console.log("Trust init: TrustToken: symbol: %s", token.symbol());
        // console.log("Trust init: TrustToken: supply: %s", token.totalSupply());
        // console.log("Trust init: TrustToken: trust balance: %s", token.balanceOf(address(this)));

        // uint256 normalized_locked_amount = SafeMath.mul(uint256(10) ** ERC20.ERC20(reserve_token).decimals(), _reserve_deposit.lockedAmount);
        // console.log(
        //     "Trust init: About to transfer %s of %s",
        //     normalized_locked_amount,
        //     ERC20.ERC20(reserve_token).name()
        // );
        // console.log("Sender balance: %s", ERC20.ERC20(reserve_token).balanceOf(address(msg.sender)));
        // console.log("Sender address: %s", address(msg.sender));
        // console.log("Contract address: %s", address(this));
        // console.log("Contract allowance: %s", ERC20.ERC20(reserve_token).allowance(address(msg.sender), address(this)));
        // bool redeemer_xfer = ERC20.ERC20(reserve_token).transferFrom(address(msg.sender), address(this), normalized_locked_amount);
        // require(redeemer_xfer, "ERR_RESERVE_TOKEN_TRANSFER");
        // console.log("Trust init: transfer successful");
        // console.log("Trust init: trust reserve balance: %s", ERC20.ERC20(reserve_token).balanceOf(address(this)));

        // redeemer = new Redeemer.Redeemer();

        // ERC20.ERC20(reserve_token).increaseAllowance(address(redeemer), normalized_locked_amount);

        // redeemer.init(reserve_token, normalized_locked_amount, token, _unlock_block);
        // require(!redeemer.isUnlocked());

        // console.log("Trust init: Redeemer: address: %s", address(redeemer));
        // console.log("Trust init: Redeemer: unlocked: %s", redeemer.isUnlocked());

        uint256 normalized_pool_reserve_amount = SafeMath.mul(uint256(10) ** ERC20.ERC20(reserve_token).decimals(), _reserve_deposit.poolAmount);
        uint256 normalized_pool_token_amount = token.balanceOf(address(this));
        console.log("Pool reserve amount: %s", normalized_pool_reserve_amount);
        console.log("Pool token amount: %s", normalized_pool_token_amount);

        // Weight 20 for reserve.
        uint256 reserve_weight = BalancerConstants.MIN_WEIGHT;
        // Weight proportional for token or min-weight.
        uint256 token_weight = Math.min(
            SafeMath.sub(BalancerConstants.MAX_WEIGHT, SafeMath.add(reserve_weight, BalancerConstants.BONE)),
            SafeMath.mul(
                SafeMath.div(normalized_pool_token_amount, normalized_pool_reserve_amount),
                reserve_weight
            )
        );
        console.log("Pool reserve weight: %s", reserve_weight);
        console.log("Pool token weight: %s", token_weight);

        console.log("About to newCrp");


        address[] storage poolAddresses;
        poolAddresses.push(address(reserve_token));
        poolAddresses.push(address(token));

        uint256[] storage poolAmounts;
        poolAmounts.push(normalized_pool_reserve_amount);
        poolAmounts.push(normalized_pool_token_amount);

        uint256[] storage poolWeights;
        poolWeights.push(reserve_weight);
        poolWeights.push(token_weight);

        // pool = CRPFactory.CRPFactory(Constants.CRPFactory).newCrp(
        //     Constants.BFactory,
        //     ConfigurableRightsPool.ConfigurableRightsPool.PoolParams(
        //         "TrustPool",
        //         "The Trust Pool",
        //         poolAddresses,
        //         poolAmounts,
        //         poolWeights,
        //         BalancerConstants.MIN_FEE
        //     ),
        //     RightsManager.RightsManager.Rights(
        //         // Pause
        //         false,
        //         // Change fee
        //         false,
        //         // Change weights (needed for gradual weight)
        //         true,
        //         // Add/remove tokens
        //         true,
        //         // Whitelist LPs (@todo needed?)
        //         false,
        //         // Change cap
        //         false
        //     )
        // );
        console.log("newCrp success");

        initialized = true;
    }
}