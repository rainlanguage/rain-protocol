// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

// import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { console } from "hardhat/console.sol";

import { Constants } from './libraries/Constants.sol';
import { Initable } from './libraries/Initable.sol';
import { BlockBlockable } from './libraries/BlockBlockable.sol';
import { NotRuggableERC20 } from './libraries/NotRuggableERC20.sol';

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
contract RedeemableToken is Ownable, Initable, BlockBlockable, NotRuggableERC20 {

    event Redeem(address _redeemer, uint256 _redeem_amount);

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

    // In the constructor we set everything that configures the contract but it stateless.
    // There are no token transfers, mints or locks.
    // Redemption is not possible until after init()
    constructor (
        // Name forwarded through to parent ERC20 contract.
        string memory _name,
        // Symbol forwarded through to parent ERC20 contract.
        string memory _symbol,
        // Reserve can be any IERC20 token.
        // IMPORTANT: It is up to the caller to define a reserve that will remain functional and outlive the RedeemableToken.
        // For example, USDC could freeze the tokens owned by the RedeemableToken contract or close their business.
        // In either case the redeem function would be pointing at a dangling reserve balance.
        IERC20 _reserve,
        // The amount of reserve to take against minting.
        uint256 _reserve_total,
        // The ratio of RedeemableToken to mint per reserve token.
        // This, as per Balancer, should be an integer as 10^18 to represent decimals.
        // Therefore a 1:1 ratio is 1 000000 000000 000000.
        uint256 _ratio
    ) public NotRuggableERC20(_name, _symbol) {
        console.log("RedeemableToken: constructor: %s %s", _name, _symbol);
        console.log("RedeemableToken: constructor: %s %s", _reserve_total, _ratio);
        reserve = _reserve;
        reserve_total = _reserve_total;
        ratio = _ratio;
    }

    // All the stateful stuff is done in init().
    //
    // Notably the caller MUST approve EXACTLY the reserve_total of the reserve token for this contract.
    // init will revert if the allowance is not set correctly.
    //
    // This contract will transfer the preset amount of reserve token to itself and mint the fixed preset ratio of itself.
    // The newly minted token is for this contract's owner and only the owner can call init.
    //
    // The owner is expected to fairly distribute the token before redemptions are unblocked.
    // The owner must set the _unblock_block at init time so the distribution and redemption periods are fixed and can be audited.
    function init(
        uint256 _unblock_block
    ) public onlyOwner onlyBlocked withInit {
        console.log("RedeemableToken: init: %s", _unblock_block);

        // Init can only be called by the owner.
        // Only the owner can send reserve and receive minted tokens.
        // The intent is that the owner will be another smart contract managing the token flows.
        address mintor = Ownable(this).owner();

        // The reserve allowance MUST be exactly what we are going to take from the owner and lock.
        // There is NEVER any reason for the owner to send more or less reserve than what was configured at construction.
        console.log("RedeemableToken: Reserve: %s from %s", reserve_total, mintor);
        require(IERC20(reserve).allowance(mintor, address(this)) == reserve_total, "ERR_ALLOWANCE_RESERVE");
        bool xfer = IERC20(reserve).transferFrom(mintor, address(this), reserve_total);
        require(xfer, "ERR_INIT_RESERVE");

        // Mint redeemable tokens according to the preset schedule.
        uint256 token_supply = SafeMath.div(
            SafeMath.mul(ratio, reserve_total),
            Constants.ONE
        );
        console.log("RedeemableToken: Mint %s %s for %s", token_supply, this.name(), mintor);
        _mint(mintor, token_supply);

        // Set the unblock schedule.
        BlockBlockable.setUnblockBlock(_unblock_block);
    }

    function redeem(uint256 _redeem_amount) public onlyInit onlyUnblocked {
        // Redeem uses _transfer to move its own tokens to itself which does NOT require approval.
        // _transfer reverts internally there is no return value.
        console.log("RedeemableToken: redeem: amount %s", _redeem_amount);
        super._transfer(msg.sender, address(this), _redeem_amount);

        // transfer can fail without reverting so we need to revert ourselves if the reserve fails to be sent.
        // (transfer cannot actually fail without reverting, but it's probably a good idea to handle the bool as though it can)
        uint256 _reserve_release = SafeMath.div(SafeMath.mul(_redeem_amount, Constants.ONE), ratio);
        console.log("RedeemableToken: redeem: reserve %s", _reserve_release);
        bool _xfer_out = IERC20(reserve).transfer(msg.sender, _reserve_release);
        require(_xfer_out, "ERR_REDEEM_RESERVE");

        emit Redeem(msg.sender, _redeem_amount);
    }
}
