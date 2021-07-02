// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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
    IPrestige prestige;
    IPrestige.Status minimumStatus;
    // Number of redeemable tokens to mint.
    uint256 totalSupply;
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
contract RedeemableERC20 is Ownable, BlockBlockable, PrestigeByConstruction, ERC20, ReentrancyGuard {

    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /// Redeemable token burn amount.
    event Redeem(
        address indexed redeemer,
        address indexed redeemable,
        uint256 indexed redeemAmount
    );

    /// The maximum number of redeemables that can be set.
    /// Attempting to add more redeemables than this will fail with an error.
    /// This prevents a very large loop in the `redeem` function.
    uint8 public constant MAX_REDEEMABLES = 8;

    /// The minimum status that a user must hold to receive transfers while the token is blocked.
    /// The prestige contract passed to `PrestigeByConstruction` determines if the status is held during `_beforeTokenTransfer`.
    IPrestige.Status public minimumPrestigeStatus;

    IERC20[] private redeemables;

    mapping(address => uint8) public unfreezables;

    // In the constructor we set everything that configures the contract but it stateless.
    // There are no token transfers, mints or locks.
    // Redemption is not possible until after init()
    constructor (
        RedeemableERC20Config memory redeemableERC20Config_
    )
        public
        ERC20(redeemableERC20Config_.name, redeemableERC20Config_.symbol)
        PrestigeByConstruction(redeemableERC20Config_.prestige)
    {
        minimumPrestigeStatus = redeemableERC20Config_.minimumStatus;

        // Given that the owner can set unfreezables it makes no sense not to add them to the list.
        // OK, so there is extra gas in doing this, but it means fewer state reads during transfers.
        // We bypass the method here because owner has not yet been set so onlyOwner will throw.
        unfreezables[msg.sender] = 0x0002;

        _mint(msg.sender, redeemableERC20Config_.totalSupply);
    }

    function ownerAddSender(address account_)
        external
        onlyOwner
        onlyBlocked
    {
        unfreezables[account_] = unfreezables[account_] | 0x01;
    }

    function isSender(address account_) public view returns (bool) {
        return (unfreezables[account_] & 0x01) == 0x01;
    }

    function ownerAddReceiver(address account_)
        external
        onlyOwner
        onlyBlocked
        {
            unfreezables[account_] = unfreezables[account_] | 0x02;
        }

    function isReceiver(address account_) public view returns (bool) {
        return (unfreezables[account_] & 0x02) == 0x02;
    }

    function ownerSetUnblockBlock(uint256 unblockBlock_) external onlyOwner {
        setUnblockBlock(unblockBlock_);
    }

    function ownerAddRedeemable(IERC20 newRedeemable_) external onlyOwner {
        // Somewhat arbitrary but we limit the length of redeemables to 8.
        // 8 is actually a lot.
        // Consider that every `redeem` call must loop a `balanceOf` and `safeTransfer` per redeemable.
        require(redeemables.length<MAX_REDEEMABLES, "MAX_REDEEMABLES");
        for (uint256 i_ = 0; i_<redeemables.length;i_++) {
            require(redeemables[i_] != newRedeemable_, "DUPLICATE_REDEEMABLE");
        }
        redeemables.push(newRedeemable_);
    }

    function getRedeemables() external view returns (address[8] memory) {
        // Need a fixed length to avoid unpredictable gas issues.
        address[8] memory redeemablesArray_;
        for(uint256 i_ = 0;i_<redeemables.length;i_++) {
            redeemablesArray_[i_] = address(redeemables[i_]);
        }
        return redeemablesArray_;
    }

    function burn(uint256 burnAmount_) external {
        _burn(msg.sender, burnAmount_);
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
    function redeemSpecific(IERC20[] memory specificRedeemables_, uint256 redeemAmount_) public onlyUnblocked nonReentrant {
        // The fraction of the redeemables we release is the fraction of the outstanding total supply passed in.
        // Every redeemable is released in the same proportion.
        uint256 supplyBeforeBurn_ = totalSupply();

        // Redeem __burns__ tokens which reduces the total supply and requires no approval.
        // Because the total supply changes, we need to do this __after__ the reserve handling.
        // _burn reverts internally if needed (e.g. if burn exceeds balance).
        _burn(msg.sender, redeemAmount_);

        for(uint256 i_ = 0; i_ < specificRedeemables_.length; i_++) {
            IERC20 ithRedeemable_ = specificRedeemables_[i_];
            emit Redeem(msg.sender, address(ithRedeemable_), redeemAmount_);
            ithRedeemable_.safeTransfer(
                msg.sender,
                ithRedeemable_.balanceOf(address(this)).mul(redeemAmount_).div(supplyBeforeBurn_)
            );
        }
    }

    function redeem(uint256 redeemAmount_) external {
        redeemSpecific(redeemables, redeemAmount_);
    }

    function _beforeTokenTransfer(
        address sender_,
        address receiver_,
        uint256 amount_
    )
        internal
        override
    {
        // Some contracts may attempt a preflight (e.g. Balancer) of a 0 amount transfer.
        // In this case we do not want concerns such as prestige causing errors.
        if (amount_ > 0) {
            // Sending tokens to this contract (e.g. instead of redeeming) is always an error.
            require(receiver_ != address(this), "TOKEN_SEND_SELF");

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
                    receiver_ == address(0) || isReceiver(receiver_) || isSender(sender_),
                    "FROZEN"
                );
            } else {
                // Redemption is blocked.
                // All transfer actions allowed.
                require(
                    isReceiver(receiver_) || isSender(sender_) || isStatus(receiver_, minimumPrestigeStatus),
                    "MIN_STATUS"
                );
            }
        }
    }
}
