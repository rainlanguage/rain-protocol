// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { Constants } from "./libraries/Constants.sol";
import { Initable } from "./libraries/Initable.sol";
import { BlockBlockable } from "./libraries/BlockBlockable.sol";
import { PrestigeByConstruction } from "./tv-prestige/contracts/PrestigeByConstruction.sol";
import { IPrestige } from "./tv-prestige/contracts/IPrestige.sol";

struct RedeemableERC20Config {
    // Name forwarded through to parent ERC20 contract.
    string name;
    // Symbol forwarded through to parent ERC20 contract.
    string symbol;
    // Reserve can be any IERC20 token.
    // IMPORTANT: It is up to the caller to define a reserve that will remain functional and outlive the RedeemableERC20.
    // For example, USDC could freeze the tokens owned by the RedeemableERC20 contract or close their business.
    // In either case the redeem function would be pointing at a dangling reserve balance.
    IERC20 reserve;
    IPrestige prestige;
    IPrestige.Status minimumStatus;
    // Number of redeemable tokens to mint.
    uint256 totalSupply;
    uint256 unblockBlock;
}

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
// A `Redeem` event is emitted on every redemption as `(_redeemer, _redeem_amoutn, _reserveRelease)`.
contract RedeemableERC20 is Ownable, BlockBlockable, PrestigeByConstruction, ERC20 {

    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    event Redeem(
        address _redeemer,
        // Redeemable amount burned, Reserve amount out
        uint256[2]
    );

    // This is the reserve token.
    // It is openly visible to the world so people can verify the reserve token has value.
    IERC20 public reserve;
    IPrestige.Status public minimumPrestigeStatus;

    mapping(address => bool) public unfreezables;

    // In the constructor we set everything that configures the contract but it stateless.
    // There are no token transfers, mints or locks.
    // Redemption is not possible until after init()
    constructor (
        RedeemableERC20Config memory _redeemableERC20Config
    )
        public
        ERC20(_redeemableERC20Config.name, _redeemableERC20Config.symbol)
        PrestigeByConstruction(_redeemableERC20Config.prestige)
    {
        reserve = _redeemableERC20Config.reserve;
        minimumPrestigeStatus = _redeemableERC20Config.minimumStatus;

        // Given that the owner can set unfreezables it makes no sense not to add them to the list.
        // OK, so there is extra gas in doing this, but it means fewer state reads during transfers.
        // We bypass the method here because owner has not yet been set so onlyOwner will throw.
        unfreezables[msg.sender] = true;
        // Mint redeemable tokens according to the preset schedule.
        _mint(msg.sender, _redeemableERC20Config.totalSupply);
    }

    function addUnfreezable(address _address)
        external
        onlyOwner
        onlyBlocked
    {
        unfreezables[_address] = true;
    }

    // Redeem tokens.
    // Tokens can be _redeemed_ but NOT _transferred_ after the unblock block.
    //
    // Calculate the redeem value of tokens as:
    //
    // ( _redeemAmount / token.totalSupply() ) * reserve.balanceOf(address(this))
    //
    // This means that the users get their redeemed pro-rata share of the outstanding token supply
    // burned in return for a pro-rata share of the current reserve balance.
    //
    // I.e. whatever % of redeemable tokens the sender burns is the % of the current reserve they receive.
    //
    // Note: Any tokens held by the 0 address are burned defensively.
    //       This is because transferring to 0 will go through but the `totalSupply` won't reflect it.
    function redeem(uint256 _redeemAmount) external onlyUnblocked {
        // We have to allow direct transfers to address 0x0 in order for _burn to work.
        // This is NEVER a good thing though.
        // The user that sent to 0x0 will lose their funds without recourse.
        // When super._burn() is called it correctly decreases the totalSupply.
        // When a user inadvertently or maliciously sends to 0x0 without burning we want to give more rewards to everyone else.
        // We _could_ defensively call super._burn() here but it would open a griefing opportunity
        // where someone can send dust to 0x0 and force the next redemption to pay for a burn.
        uint256 _circulatingSupply = totalSupply() - balanceOf(address(0));

        // The fraction of the reserve we release is the fraction of the outstanding total supply passed in.
        uint256 _reserveFraction = _redeemAmount.mul(Constants.ONE).div(_circulatingSupply);
        uint256 _reserveRelease = reserve.balanceOf(address(this)).mul(_reserveFraction).div(Constants.ONE);

        // Redeem __burns__ tokens which reduces the total supply and requires no approval.
        // Because the total supply changes, we need to do this __after__ the reserve handling.
        // _burn reverts internally if needed (e.g. if burn exceeds balance); there is no return value.
        _burn(msg.sender, _redeemAmount);

        emit Redeem(msg.sender, [_redeemAmount, _reserveRelease]);

        // External function call last.
        // Send the reserve token to the redeemer.
        reserve.safeTransfer(msg.sender, _reserveRelease);
    }

    function ownerSetUnblockBlock(uint256 _unblockBlock) external onlyOwner {
        setUnblockBlock(_unblockBlock);
    }

    function _beforeTokenTransfer(
        address,
        address _receiver,
        uint256
    )
        internal
        override
    {
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
        if (isUnblocked()) {
            // Redemption is unblocked.
            // Can burn.
            // Only owner and unfreezables can receive.
            require(
                _receiver == address(0) || unfreezables[_receiver] == true,
                "ERR_FROZEN"
            );
        } else {
            // Redemption is blocked.
            // All transfer actions allowed.
            require(
                unfreezables[_receiver] || isStatus(_receiver, minimumPrestigeStatus),
                "ERR_MIN_STATUS"
            );
        }
    }
}
