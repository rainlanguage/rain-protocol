// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

// Needed to handle structures externally
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "hardhat/console.sol";

import "./configurable-rights-pool/libraries/BalancerConstants.sol";

import "./Redeemer.sol";
import "./TrustToken.sol";

contract Trust {

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
        ERC20 reserveToken;
        // Amount of the reserve token to lock up.
        uint256 lockedAmount;
        // Amount of the reserve token to add to pool.
        uint256 poolAmount;
    }

    ERC20 public reserve_token;
    TrustToken public token;
    Redeemer public redeemer;

    constructor(
        TokenDefinition memory _token_definition,
        ReserveDeposit memory _reserve_deposit,
        uint256 _unlock_block
    ) public {
        token = new TrustToken(
            _token_definition.initialSupply.mul(BalancerConstants.BONE),
            _token_definition.name,
            _token_definition.symbol
        );

        reserve_token = _reserve_deposit.reserveToken;

        console.log("Trust constructor: TrustToken: address: %s", address(token));
        console.log("Trust constructor: TrustToken: name: %s", token.name());
        console.log("Trust constructor: TrustToken: symbol: %s", token.symbol());
        console.log("Trust constructor: TrustToken: supply: %s", token.totalSupply());
        console.log("Trust constructor: TrustToken: trust balance: %s", token.balanceOf(address(this)));

        uint256 normalized_locked_amount = SafeMath.mul(ERC20(reserve_token).decimals(), _reserve_deposit.lockedAmount);
        bool redeemer_xfer = ERC20(reserve_token).transferFrom(msg.sender, address(this), normalized_locked_amount);
        require(redeemer_xfer, "ERR_RESERVE_TOKEN_TRANSFER");

        redeemer = new Redeemer(
            reserve_token,
            normalized_locked_amount,
            token,
            _unlock_block
        );

        console.log("Trust constructor: Redeemer: address: %s", address(redeemer));
        console.log("Trust constructor: Redeemer: unlocked: %s", redeemer.isUnlocked());
    }
}