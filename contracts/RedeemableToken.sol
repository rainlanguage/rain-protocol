// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { console } from "hardhat/console.sol";

import { Constants } from './libraries/Constants.sol';
import { Initable } from './libraries/Initable.sol';
import { BlockBlockable } from './libraries/BlockBlockable.sol';
import { NotRuggable } from './libraries/NotRuggable.sol';

// RedeemableToken is an ERC20 issued in fixed ratio and redeemable for another ERC20 at a fixed block
//
// RedeemableToken is not upgradeable and has no admin/owner functions other than the initialization.
//
// The constructor defines:
//
// - The ERC20 name and symbol of the RedeemableToken
// - The reserve token, e.g. DAI, USDC, etc.
// - The amount of the reserve token to lock until block X
// - The ratio in which RedeemableToken will be minted _during initialization_ against the reserve amount locked
//
// Initialization can ONLY be done by the owner and:
//
// - Transfers reserve tokens _from_ the owner _to_ RedeemableToken
// - Mints ( ratio * reserve total ) new tokens for the owner as a once-off
// - Sets the unblock block, after which redemption is allowed
//
// Redemption is possible when the contract is initialized and unblocked.
//
// The `redeem` function MUST be used to redeem RedeemableTokens.
// Simply sending RedeemableToken tokens to the RedeemableToken contract address will _burn them along with their associated reserve token_.
//
// The `redeem` function will simply revert if called before the unblock block.
//
// After the unblock block the `redeem` function will transfer RedeemableToken tokens to itself and reserve tokens to the caller according to the ratio.
contract RedeemableToken is Ownable, Initable, BlockBlockable, NotRuggable, ERC20 {

    // RedeemableToken will be issued in a fixed ratio to the locked reserve.
    // This is openly visible to the world, for building dashboards or whatever.
    // A ratio of 1:1, as in Balancer, is 10 ** 18
    uint256 public ratio;

    // This is the reserve token.
    // It is openly visible to the world so people can verify the reserve token has value.
    IERC20 public reserve;

    // This is the total amount of reserve initially locked.
    // This is openly visible to the world so people can calculate the book value of their tokens.
    uint256 public reserve_total;

    constructor (
        string _name,
        string _symbol,
        IERC20 _reserve,
        uint256 _reserve_total,
        uint256 _ratio
    ) public ERC20(_name, _symbol) {
        console.log("RedeemableToken: constructor: %s %s %s %s %s", _name, _symbol, _reserve, _reserve_total, _ratio);
        reserve = _reserve;
        reserve_total = _reserve_total;
        ratio = _ratio;
    }

    function init(
        uint256 _unlock_block
    ) public onlyOwner onlyBlocked withInit {
        console.log("RedeemableToken: init: %s", _unlock_block);

        // Init can only be called by the owner.
        // Only the owner can send reserve and receive minted tokens.
        // The intent is that the owner will be another smart contract managing the token flows.
        address mintor = Ownable(this).owner();

        console.log("RedeemableToken: Reserve %s: %s from %s", reserve, reserve_total, mintor);
        bool xfer = IERC20(reserve).transferFrom(mintor, address(this), reserve_total);
        require(xfer, "ERR_INIT_RESERVE");

        uint256 token_supply = SafeMath.div(
            SafeMath.mul(ratio, reserve_total),
            Constants.ONE
        );
        console.log("RedeemableToken: Mint %s %s for %s", token_supply, IERC20(this).name(), mintor);
        _mint(mintor, token_supply);

        BlockBlockable.setUnlockBlock(_unlock_block);
    }

    function redeem(uint256 redeemAmount) public onlyInit onlyUnblocked {
        bool xferIn = this.transferFrom(msg.sender, address(this), redeemAmount);
        require(xferIn, "ERR_REDEEM_TOKEN");

        uint256 reserve_refund = SafeMath.div(redeemAmount, ratio);
        bool xferOut = IERC20(reserve).transferFrom(address(this), msg.sender, reserve_refund);
        require(xferOut, "ERR_REDEEM_RESERVE");
    }
}
