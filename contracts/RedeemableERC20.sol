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

// RedeemableERC20 is an ERC20 issued in fixed ratio and redeemable for another ERC20 at a fixed block
//
// RedeemableERC20 is not upgradeable and has no admin/owner functions other than the initialization.
//
// The constructor defines:
//
// - The ERC20 name and symbol of the RedeemableERC20
// - The reserve token, e.g. DAI, USDC, etc.
// - The amount of the reserve token to lock until block X
// - The ratio in which RedeemableERC20 will be minted _during initialization_ against the reserve amount locked
//
// Initialization can ONLY be done by the owner and:
//
// - Transfers reserve tokens _from_ the owner _to_ RedeemableERC20
// - Mints ( ratio * reserve total ) new tokens for the owner as a once-off
// - Sets the unblock block, after which redemption is allowed
//
// Redemption is possible when the contract is initialized and unblocked.
//
// Transfers are NOT possible once redemptions open _except_:
//
// - To burn tokens during redemption
// - To send to the owner (e.g. to facilitate exiting a balancer pool)
//
// The `redeem` function MUST be used to redeem RedeemableERC20s.
// Sending RedeemableERC20 tokens to the RedeemableERC20 contract address will _make them unrecoverable_.
//
// The `redeem` function will simply revert if called before the unblock block.
//
// After the unblock block the `redeem` function will transfer RedeemableERC20 tokens to itself and reserve tokens to the caller according to the ratio.
//
// A `Redeem` event is emitted on every redemption as `(_redeemer, _redeem_amoutn, _reserve_release)`.
contract RedeemableERC20 is Ownable, Initable, BlockBlockable, ERC20 {

    using SafeMath for uint256;

    event Redeem(address _redeemer, uint256 _redeem_amount, uint256 _reserve_release);

    // RedeemableERC20 will be issued in a fixed ratio to the locked reserve.
    // This is openly visible to the world, for building dashboards or whatever.
    // A ratio of 1:1, as in Balancer, is 10 ** 18
    // This is NOT the redemption ratio if more reserve is added after construction.
    uint256 public mint_ratio;

    // This is the reserve token.
    // It is openly visible to the world so people can verify the reserve token has value.
    IERC20 public reserve;

    // The starting reserve balance.
    // This is openly visible but be aware that the redemptions are dynamic against the
    // current reserve balance of this contract.
    uint256 public reserve_init;

    mapping(address => bool) public unfreezables;

    // In the constructor we set everything that configures the contract but it stateless.
    // There are no token transfers, mints or locks.
    // Redemption is not possible until after init()
    constructor (
        // Name forwarded through to parent ERC20 contract.
        string memory _name,
        // Symbol forwarded through to parent ERC20 contract.
        string memory _symbol,
        // Reserve can be any IERC20 token.
        // IMPORTANT: It is up to the caller to define a reserve that will remain functional and outlive the RedeemableERC20.
        // For example, USDC could freeze the tokens owned by the RedeemableERC20 contract or close their business.
        // In either case the redeem function would be pointing at a dangling reserve balance.
        IERC20 _reserve,
        // The amount of reserve to take against minting.
        uint256 _reserve_init,
        // The ratio of RedeemableERC20 to mint per reserve token.
        // This, as per Balancer, should be an integer as 10^18 to represent decimals.
        // Therefore a 1:1 ratio is 1 000000 000000 000000.
        uint256 _mint_ratio
    ) public ERC20(_name, _symbol) {
        console.log("RedeemableERC20: constructor: %s %s", _name, _symbol);
        console.log("RedeemableERC20: constructor: %s %s", _reserve_init, _mint_ratio);
        reserve = _reserve;
        reserve_init = _reserve_init;
        mint_ratio = _mint_ratio;
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
    //
    // Init can only be called by the owner.
    // Only the owner can send reserve and receive minted tokens.
    // The intent is that the owner will be another smart contract managing the token flows.
    function init(
        uint256 _unblock_block
    ) public onlyOwner onlyBlocked withInit {
        console.log("RedeemableERC20: init: %s", _unblock_block);

        // The reserve allowance MUST be exactly what we are going to take from the owner and lock.
        // There is NEVER any reason for the owner to send more or less reserve than what was configured at construction.
        console.log("RedeemableERC20: Reserve: %s from %s", reserve_init, msg.sender);
        require(IERC20(reserve).allowance(msg.sender, address(this)) == reserve_init, "ERR_ALLOWANCE_RESERVE");
        bool xfer = IERC20(reserve).transferFrom(msg.sender, address(this), reserve_init);
        require(xfer, "ERR_INIT_RESERVE");

        // Mint redeemable tokens according to the preset schedule.
        uint256 token_supply = mint_ratio.mul(reserve_init).div(Constants.ONE);
        console.log("RedeemableERC20: Mint %s %s for %s", token_supply, name(), msg.sender);
        _mint(msg.sender, token_supply);

        // Set the unblock schedule.
        BlockBlockable.setUnblockBlock(_unblock_block);
    }

    function addUnfreezable(address _address) public onlyOwner onlyBlocked onlyInit {
        unfreezables[_address] = true;
    }

    function _beforeTokenTransfer(address _sender, address _receiver, uint256 _amount) internal override {
        console.log("RedeemableERC20: _beforeTokenTransfer %s %s %s", _amount, _sender, _receiver);

        // We explicitly will never mint more than once.
        // We never get explicit dispatch info from _mint or _burn etc.
        // to know what is happening we need to infer it from context.
        // `_mint` in Open Zeppelin ERC20 is always from the 0 address.
        // Open Zeppelin already reverts any other transfer from the 0 address.
        // We do need to allow minting when the supply is 0.
        require(
            // _mint always comes from 0x0.
            ( _sender != address(0) )
            // which is fine if we're still initializing.
            || ( !initialized )
            // _burn will look like a _mint if we're burning from 0x0.
            || ( _sender == address(0) && _receiver == address(0) ), "ERR_RUG_PULL");

        // Sending tokens to this contract (e.g. instead of redeeming) is always an error.
        require(_receiver != address(this), "ERR_TOKEN_SEND_SELF");

        // There are two clear phases:
        //
        // ## Before redemption is unblocked
        //
        // - All transfers other than minting (see above) are allowed (trading, transferring, etc.)
        // - Redemption is NOT allowed
        //
        // ## After redemption is unblocked
        //
        // - All transfers are frozen (no trading, transferring, etc.) but redemption/burning is allowed
        // - Transfers TO the owner are allowed (notably the pool tokens can be used by the owner to exit the pool)
        // - Transfers FROM the owner are NOT allowed (the owner can only redeem like everyone else)
        if (BlockBlockable.isUnblocked()) {
            // Redemption is unblocked.
            // Can burn.
            // Only owner can receive.
            console.log("RedeemableERC20: _beforeTokenTransfer: owner: %s", owner());
            require(_receiver == address(0) || unfreezables[_receiver] == true, "ERR_FROZEN");
        }
        else {
            // Redemption is blocked.
            // All transfer actions allowed.
        }
    }

    // Redeem tokens.
    // Tokens can be _redeemed_ but NOT _transferred_ after the unblock block.
    //
    // Calculate the redeem value of tokens as:
    //
    // ( _redeem_amount / token.totalSupply() ) * reserve.balanceOf(address(this))
    //
    // This means that the users get their redeemed pro-rata share of the outstanding token supply
    // burned in return for a pro-rata share of the current reserve balance.
    //
    // I.e. whatever % of redeemable tokens the sender burns is the % of the current reserve they receive.
    //
    // Note: Any tokens held by the 0 address are burned defensively.
    //       This is because transferring to 0 will go through but the `totalSupply` won't reflect it.
    function redeem(uint256 _redeem_amount) public onlyInit onlyUnblocked {
        // We have to allow direct transfers to address 0x0 in order for _burn to work.
        // This is NEVER a good thing though.
        // The user that sent to 0x0 will lose their funds without recourse.
        // When super._burn() is called it correctly decreases the totalSupply.
        // When a user inadvertently or maliciously sends to 0x0 without burning we want to give more rewards to everyone else.
        // We _could_ defensively call super._burn() here but it would open a griefing opportunity
        // where someone can send dust to 0x0 and force the next redemption to pay for a burn.
        uint256 _circulating_supply = totalSupply() - balanceOf(address(0));

        // The fraction of the reserve we release is the fraction of the outstanding total supply passed in.
        uint256 _reserve_fraction = _redeem_amount.mul(Constants.ONE).div(_circulating_supply);
        uint256 _reserve_release = reserve.balanceOf(address(this)).mul(_reserve_fraction).div(Constants.ONE);

        console.log("RedeemableERC20: redeem: %s %s", _redeem_amount, totalSupply());
        console.log("RedeemableERC20: redeem: reserve %s %s %s", reserve.balanceOf(address(this)), _reserve_fraction, _reserve_release);

        // transfer can fail without reverting so we need to revert ourselves if the reserve fails to be sent.
        // (transfer cannot actually fail without reverting, but it's probably a good idea to handle the bool as though it can)
        bool _xfer_out = IERC20(reserve).transfer(msg.sender, _reserve_release);
        require(_xfer_out, "ERR_REDEEM_RESERVE");

        // Redeem __burns__ tokens which reduces the total supply and requires no approval.
        // Because the total supply changes, we need to do this __after__ the reserve handling.
        // _burn reverts internally if needed (e.g. if burn exceeds balance); there is no return value.
        super._burn(msg.sender, _redeem_amount);

        emit Redeem(msg.sender, _redeem_amount, _reserve_release);
    }
}
