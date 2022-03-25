// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {ERC20Config} from "../erc20/ERC20Config.sol";
import "../erc20/ERC20Redeem.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Phased} from "../phased/Phased.sol";

import {ERC20Pull, ERC20PullConfig} from "../erc20/ERC20Pull.sol";

struct RedeemableERC20Config {
    address reserve;
    ERC20Config erc20Config;
    address distributionEndForwardingAddress;
}

/// @title RedeemableERC20Unfreezable
/// Contract for testing purposes only.
contract RedeemableERC20Unfreezable is Initializable, Phased, ERC20Redeem, ERC20Pull {
    using SafeERC20 for IERC20;

    uint256 private constant PHASE_UNINITIALIZED = 0;
    uint256 private constant PHASE_DISTRIBUTING = 1;
    /// TESTING: 'Malicious' RedeemableERC20 which does not freeze
    uint256 private constant PHASE_UNFROZEN = 2;

    uint256 private constant RECEIVER = 0x1;
    uint256 private constant SENDER = 0x3;

    address private admin;

    mapping(address => uint256) private access;

    address private distributionEndForwardingAddress;

    function initialize(RedeemableERC20Config memory config_)
        external
        initializer
    {
        initializePhased();

        __ERC20_init(config_.erc20Config.name, config_.erc20Config.symbol);
        initializeERC20Pull(
            ERC20PullConfig(config_.erc20Config.distributor, config_.reserve)
        );

        distributionEndForwardingAddress = config_
            .distributionEndForwardingAddress;

        access[address(0)] = SENDER;

        access[config_.erc20Config.distributor] = RECEIVER;

        if (distributionEndForwardingAddress != address(0)) {
            access[distributionEndForwardingAddress] = RECEIVER;
        }

        admin = config_.erc20Config.distributor;

        _mint(
            config_.erc20Config.distributor,
            config_.erc20Config.initialSupply
        );

        newTreasuryAsset(config_.reserve);

        schedulePhase(PHASE_DISTRIBUTING, block.number);
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "ONLY_ADMIN");
        _;
    }

    function isReceiver(address maybeReceiver_) public view returns (bool) {
        return access[maybeReceiver_] > 0;
    }

    function grantReceiver(address newReceiver_) external onlyAdmin {
        access[newReceiver_] |= RECEIVER;
    }

    function isSender(address maybeSender_) public view returns (bool) {
        return access[maybeSender_] > 1;
    }

    function grantSender(address newSender_) external onlyAdmin {
        access[newSender_] = SENDER;
    }

    function endDistribution(address distributor_)
        external
        onlyPhase(PHASE_DISTRIBUTING)
        onlyAdmin
    {
        schedulePhase(PHASE_UNFROZEN, block.number);
        address forwardTo_ = distributionEndForwardingAddress;
        uint256 distributorBalance_ = balanceOf(distributor_);
        if (distributorBalance_ > 0) {
            if (forwardTo_ == address(0)) {
                _burn(distributor_, distributorBalance_);
            } else {
                _transfer(distributor_, forwardTo_, distributorBalance_);
            }
        }
    }

    function _beforeTokenTransfer(
        address sender_,
        address receiver_,
        uint256 amount_
    ) internal virtual override {
        super._beforeTokenTransfer(sender_, receiver_, amount_);

        uint256 currentPhase_ = currentPhase();

        if (currentPhase_ != PHASE_UNFROZEN) {
            if (
                amount_ > 0 &&
                !(isSender(sender_) || isReceiver(receiver_))
            ) {
                if (currentPhase_ == PHASE_DISTRIBUTING) {
                    require(isReceiver(sender_), "2SPOKE");
                }
                else {
                    assert(false);
                }
            }
        }
    }
}
