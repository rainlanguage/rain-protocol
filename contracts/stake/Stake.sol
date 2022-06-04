// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// solhint-disable-next-line max-line-length
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../tier/TierV2.sol";
import "../tier/libraries/TierConstants.sol";

import "../math/FixedPointMath.sol";
import "../tier/libraries/TierReport.sol";

struct StakeConfig {
    address token;
    uint256 initialRatio;
    string name;
    string symbol;
}

/// @param amount Largest value we can squeeze into a uint256 alongside a
/// uint32.
struct Deposit {
    uint32 timestamp;
    uint224 amount;
}

contract Stake is ERC20Upgradeable, TierV2, ReentrancyGuard {
    event Initialize(address sender, StakeConfig config);
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using FixedPointMath for uint256;

    IERC20 private token;
    uint256 private initialRatio;

    mapping(address => Deposit[]) private deposits;

    function initialize(StakeConfig calldata config_) external initializer {
        require(config_.token != address(0), "0_TOKEN");
        require(config_.initialRatio > 0, "0_RATIO");
        __ERC20_init(config_.name, config_.symbol);
        token = IERC20(config_.token);
        initialRatio = config_.initialRatio;
        emit Initialize(msg.sender, config_);
    }

    function deposit(uint256 amount_) external nonReentrant {
        require(amount_ > 0, "0_AMOUNT");

        // MUST check token balance before receiving additional tokens.
        uint256 tokenPoolSize_ = token.balanceOf(address(this));
        // MUST use supply from before the mint.
        uint256 supply_ = totalSupply();

        // Pull tokens before minting BUT AFTER reading contract balance.
        token.safeTransferFrom(msg.sender, address(this), amount_);

        uint256 mintAmount_;
        if (supply_ == 0) {
            mintAmount_ = amount_.fixedPointMul(initialRatio);
        } else {
            mintAmount_ = (supply_ * amount_) / tokenPoolSize_;
        }
        require(mintAmount_ > 0, "0_MINT");
        _mint(msg.sender, mintAmount_);

        uint224 highwater_ = deposits[msg.sender].length > 0
            ? deposits[msg.sender][deposits[msg.sender].length - 1].amount
            : 0;
        deposits[msg.sender].push(
            Deposit(uint32(block.timestamp), highwater_ + amount_.toUint224())
        );
    }

    function withdraw(uint256 amount_) external nonReentrant {
        require(amount_ > 0, "0_AMOUNT");

        // MUST revert if length is 0 so we're guaranteed to have some amount
        // for the old highwater. Users without deposits can't withdraw.
        uint256 i_ = deposits[msg.sender].length - 1;
        uint256 oldHighwater_ = uint256(deposits[msg.sender][i_].amount);
        // MUST revert if withdraw amount exceeds highwater.
        uint256 newHighwater_ = oldHighwater_ - amount_;

        unchecked {
            while (deposits[msg.sender][i_].amount > newHighwater_) {
                delete deposits[msg.sender][i_];
                if (i_ == 0) {
                    break;
                }
                i_--;
            }
        }

        // If the newHighwater_ is not identical to the current top we write it
        // as the new top.
        uint256 cmpHighwater_ = deposits[msg.sender].length > 0
            ? deposits[msg.sender][deposits[msg.sender].length - 1].amount
            : 0;
        if (newHighwater_ > cmpHighwater_) {
            deposits[msg.sender].push(
                Deposit(uint32(block.timestamp), newHighwater_.toUint224())
            );
        }

        // MUST calculate withdrawal amount against pre-burn supply.
        uint256 supply_ = totalSupply();
        _burn(msg.sender, amount_);
        token.safeTransfer(
            msg.sender,
            (amount_ * token.balanceOf(address(this))) / supply_
        );
    }

    /// @inheritdoc ITierV2
    function report(address account_, uint[] calldata context_)
        external
        view
        returns (uint256 report_)
    {
        report_ = type(uint256).max;
        if (context_.length > 0) {
            uint256 t_ = 0;
            Deposit memory deposit_;
            for (
                uint256 i_ = 0;
                i_ < deposits[account_].length;
                i_++
            ) {
                deposit_ = deposits[account_][i_];
                while (
                    t_ < context_.length &&
                    deposit_.amount >= context_[t_]
                ) {
                    TierReport.updateTimeAtTier(
                        report_,
                        t_,
                        deposit_.timestamp
                    );
                    t_++;
                }
                if (t_ == context_.length) {
                    break;
                }
            }
        }
    }

    /// @inheritdoc ITierV2
    function reportTimeForTier(
        address account_,
        uint256 tier_,
        uint[] calldata context_
    ) external view returns (uint256 time_) {
        time_ = uint(TierConstants.NEVER_TIME);
        if (tier_ < context_.length) {
            uint threshold_ = context_[tier_];
            Deposit memory deposit_;
            for (uint i_ = 0; i_ < deposits[account_].length; i_++) {
                deposit_ = deposits[account_][i_];
                if (deposit_.amount >= threshold_) {
                    time_ = deposit_.timestamp;
                    break;
                }
            }
        }
    }
}
