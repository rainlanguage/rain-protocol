// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import {IERC20MetadataUpgradeable as IERC20Metadata} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {ERC4626Upgradeable as ERC4626} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import {SafeCastUpgradeable as SafeCast} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

import "../tier/TierV2.sol";
import "../tier/libraries/TierConstants.sol";

import "../math/FixedPointMath.sol";
import "../tier/libraries/TierReport.sol";

struct StakeConfig {
    IERC20Metadata asset;
    string name;
    string symbol;
}

/// @param amount Largest value we can squeeze into a uint256 alongside a
/// uint32.
struct DepositRecord {
    uint32 timestamp;
    uint224 amount;
}

contract Stake is ERC4626, TierV2, ReentrancyGuard {
    event Initialize(address sender, StakeConfig config);
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using FixedPointMath for uint256;
    using Math for uint256;

    mapping(address => DepositRecord[]) public depositRecords;

    function initialize(StakeConfig calldata config_) external initializer {
        require(address(config_.asset) != address(0), "0_ASSET");
        __ERC20_init(config_.name, config_.symbol);
        __ERC4626_init(config_.asset);
        emit Initialize(msg.sender, config_);
    }

    /// @inheritdoc ERC4626
    function _deposit(
        address caller_,
        address receiver_,
        uint256 assets_,
        uint256 shares_
    ) internal virtual override nonReentrant {
        require(receiver_ != address(0), "0_DEPOSIT_RECEIVER");
        require(assets_ > 0, "0_DEPOSIT_ASSETS");
        require(shares_ > 0, "0_DEPOSIT_SHARES");
        // Deposit first then upgrade ledger.
        super._deposit(caller_, receiver_, assets_, shares_);
        _addSharesToStakingLedger(receiver_, shares_);
    }

    /// @inheritdoc ERC4626
    function _withdraw(
        address caller_,
        address receiver_,
        address owner_,
        uint256 assets_,
        uint256 shares_
    ) internal virtual override nonReentrant {
        require(receiver_ != address(0), "0_WITHDRAW_RECEIVER");
        require(owner_ != address(0), "0_WITHDRAW_OWNER");
        require(assets_ > 0, "0_WITHDRAW_ASSETS");
        require(shares_ > 0, "0_WITHDRAW_SHARES");
        // Downgrade ledger first then send assets.
        _removeSharesFromStakingLedger(owner_, shares_);
        super._withdraw(caller_, receiver_, owner_, assets_, shares_);
    }

    function _addSharesToStakingLedger(address owner_, uint256 shares_)
        internal
    {
        uint256 len_ = depositRecords[owner_].length;
        uint256 highwater_ = len_ > 0
            ? depositRecords[owner_][len_ - 1].amount
            : 0;
        depositRecords[owner_].push(
            DepositRecord(
                uint32(block.timestamp),
                (highwater_ + shares_).toUint224()
            )
        );
    }

    function _removeSharesFromStakingLedger(address owner_, uint256 shares_)
        internal
    {
        // MUST revert if length is 0 so we're guaranteed to have some amount
        // for the old highwater. Users without deposits can't withdraw so there
        // will be an overflow here.
        uint256 i_ = depositRecords[owner_].length - 1;
        uint256 oldHighwater_ = uint256(depositRecords[owner_][i_].amount);
        // MUST revert if withdraw amount exceeds highwater. Overflow will
        // ensure this.
        uint256 newHighwater_ = oldHighwater_ - shares_;

        uint256 high_ = 0;
        if (newHighwater_ > 0) {
            (high_, ) = _earliestTimeAtLeastThreshold(owner_, newHighwater_, 0);
        }

        unchecked {
            while (i_ > high_) {
                depositRecords[owner_].pop();
                i_--;
            }
        }

        // For non-zero highwaters we preserve the timestamp on the new top
        // deposit and only set the amount to the new highwater.
        if (newHighwater_ > 0) {
            depositRecords[owner_][high_].amount = newHighwater_.toUint224();
        } else {
            depositRecords[owner_].pop();
        }
    }

    /// @inheritdoc ITierV2
    function report(address account_, uint256[] calldata context_)
        external
        view
        returns (uint256 report_)
    {
        unchecked {
            report_ = type(uint256).max;
            if (context_.length > 0) {
                uint256 high_ = 0;
                uint256 time_ = uint256(TierConstants.NEVER_TIME);
                for (uint256 t_ = 0; t_ < context_.length; t_++) {
                    uint256 threshold_ = context_[t_];
                    (, time_) = _earliestTimeAtLeastThreshold(
                        account_,
                        threshold_,
                        high_
                    );
                    if (time_ == uint256(TierConstants.NEVER_TIME)) {
                        break;
                    }
                    report_ = TierReport.updateTimeAtTier(report_, t_, time_);
                }
            }
        }
    }

    /// @inheritdoc ITierV2
    function reportTimeForTier(
        address account_,
        uint256 tier_,
        uint256[] calldata context_
    ) external view returns (uint256 time_) {
        if (tier_ == 0) {
            time_ = TierConstants.ALWAYS;
        } else if (tier_ <= context_.length) {
            uint256 threshold_ = context_[tier_ - 1];
            (, time_) = _earliestTimeAtLeastThreshold(account_, threshold_, 0);
        } else {
            time_ = uint256(TierConstants.NEVER_TIME);
        }
    }

    /// https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/Checkpoints.sol#L39
    function _earliestTimeAtLeastThreshold(
        address account_,
        uint256 threshold_,
        uint256 low_
    ) internal view returns (uint256 high_, uint256 time_) {
        unchecked {
            uint256 len_ = depositRecords[account_].length;
            high_ = len_;
            uint256 mid_;
            DepositRecord memory depositRecord_;
            while (low_ < high_) {
                mid_ = Math.average(low_, high_);
                depositRecord_ = depositRecords[account_][mid_];
                if (uint256(depositRecord_.amount) >= threshold_) {
                    high_ = mid_;
                } else {
                    low_ = mid_ + 1;
                }
            }
            // At this point high_ and low_ are equal, but mid_ has not been
            // updated to match, so high_ is what we return as-is.
            time_ = high_ == len_
                ? uint256(TierConstants.NEVER_TIME)
                : depositRecords[account_][high_].timestamp;
        }
    }
}
