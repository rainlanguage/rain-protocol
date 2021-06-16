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
contract RedeemableERC20 is Ownable, BlockBlockable, PrestigeByConstruction, ERC20 {

    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    event Redeem(
        address _redeemer,
        // Redeemable token burn amount.
        uint256 _redeemAmount
    );

    event RedeemFail(
        address _redeemer,
        address _redeemable
    );

    event RedeemSuccess(
        address _redeemer,
        address _redeemable
    );

    IPrestige.Status public minimumPrestigeStatus;

    // Somewhat arbitrary but we limit the length of redeemables to 8.
    // 8 is actually a lot.
    // Consider that every `redeem` call must loop a `balanceOf` and `safeTransfer` per redeemable.
    IERC20[8] private redeemables;

    mapping(address => uint8) public unfreezables;

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
        minimumPrestigeStatus = _redeemableERC20Config.minimumStatus;

        // Given that the owner can set unfreezables it makes no sense not to add them to the list.
        // OK, so there is extra gas in doing this, but it means fewer state reads during transfers.
        // We bypass the method here because owner has not yet been set so onlyOwner will throw.
        unfreezables[msg.sender] = 0x0002;

        _mint(msg.sender, _redeemableERC20Config.totalSupply);
    }

    function ownerAddSender(address _address)
        external
        onlyOwner
        onlyBlocked
    {
        unfreezables[_address] = unfreezables[_address] | 0x01;
    }

    function isSender(address _address) public view returns (bool) {
        return (unfreezables[_address] & 0x01) == 0x01;
    }

    function ownerAddReceiver(address _address)
        external
        onlyOwner
        onlyBlocked
        {
            unfreezables[_address] = unfreezables[_address] | 0x02;
        }

    function isReceiver(address _address) public view returns (bool) {
        return (unfreezables[_address] & 0x02) == 0x02;
    }

    function ownerSetUnblockBlock(uint256 _unblockBlock) external onlyOwner {
        setUnblockBlock(_unblockBlock);
    }

    function ownerAddRedeemable(IERC20 _redeemable) external onlyOwner {
        uint256 _i = 0;
        for (_i; _i<8;_i++) {
            require(redeemables[_i] != _redeemable, "ERR_DUPLICATE_REDEEMABLE");
            if (address(redeemables[_i]) == address(0)) {
                break;
            }
        }
        redeemables[_i] = _redeemable;
    }

    function getRedeemables() external view returns (IERC20[8] memory) {
        return redeemables;
    }

    function burn(uint256 _burnAmount) external {
        _burn(msg.sender, _burnAmount);
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
        // The fraction of the redeemables we release is the fraction of the outstanding total supply passed in.
        // Every redeemable is released in the same proportion.
        uint256 _supplyBeforeBurn = totalSupply();

        // Redeem __burns__ tokens which reduces the total supply and requires no approval.
        // Because the total supply changes, we need to do this __after__ the reserve handling.
        // _burn reverts internally if needed (e.g. if burn exceeds balance).
        _burn(msg.sender, _redeemAmount);

        emit Redeem(msg.sender, _redeemAmount);

        // Clear the redeemables.
        uint256 _toRedeem = 0;
        uint256 i = 0;
        for(i; i < 8; i++) {
            IERC20 _redeemable = redeemables[i];
            if (address(_redeemable) == address(0)) {
                break;
            }

            // Any one of the several redeemables may fail for some reason.
            // Consider the case where a user needs to meet additional criteria (e.g. KYC) for some token.
            // In this case _any_ of the redeemables may revert normally causing _all_ redeemables to revert.
            // We use try/catch here to force all redemptions that may succeed for the user to continue.
            try _redeemable.balanceOf(address(this)) returns (uint256 _redeemableBalance) {
                _toRedeem = _redeemAmount.mul(_redeemableBalance).div(_supplyBeforeBurn);
            } catch {
                emit RedeemFail(msg.sender, address(_redeemable));
            }

            // Reentrant call to transfer.
            // Note the events emitted _after_ possible reentrancy.
            try _redeemable.transfer(msg.sender, _toRedeem) returns (bool _success) {
                if (_success) {
                    emit RedeemSuccess(msg.sender, address(_redeemable));
                }
                else {
                    emit RedeemFail(msg.sender, address(_redeemable));
                }
            }
            catch {
                emit RedeemFail(msg.sender, address(_redeemable));
            }
        }
    }

    function _beforeTokenTransfer(
        address _sender,
        address _receiver,
        uint256 _amount
    )
        internal
        override
    {
        // Some contracts may attempt a preflight (e.g. Balancer) of a 0 amount transfer.
        // In this case we do not want concerns such as prestige causing errors.
        if (_amount > 0) {
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
                    _receiver == address(0) || isReceiver(_receiver) || isSender(_sender),
                    "ERR_FROZEN"
                );
            } else {
                // Redemption is blocked.
                // All transfer actions allowed.
                require(
                    isReceiver(_receiver) || isSender(_sender) || isStatus(_receiver, minimumPrestigeStatus),
                    "ERR_MIN_STATUS"
                );
            }
        }
    }
}
