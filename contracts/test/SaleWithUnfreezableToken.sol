// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "../math/FixedPointMath.sol";
import {ERC20Config} from "../erc20/ERC20Config.sol";
import "../sale/ISale.sol";
import {RedeemableERC20Unfreezable, RedeemableERC20Config} from "./RedeemableERC20Unfreezable.sol";
import {RedeemableERC20UnfreezableFactory} from "./RedeemableERC20UnfreezableFactory.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

struct SaleConstructorConfig {
    RedeemableERC20UnfreezableFactory redeemableERC20Factory;
}

struct SaleConfig {
    address recipient;
    IERC20 reserve;
    uint256 minimumRaise;
}

struct SaleRedeemableERC20Config {
    ERC20Config erc20Config;
    address distributionEndForwardingAddress;
}

struct BuyConfig {
    uint256 fee;
    uint256 minimumUnits;
    uint256 desiredUnits;
}

/// @title SaleWithUnfreezableToken
/// Contract for testing purposes only.
contract SaleWithUnfreezableToken is
    Initializable,
    ISale
{
    using Math for uint256;
    using FixedPointMath for uint256;
    using SafeERC20 for IERC20;

    RedeemableERC20UnfreezableFactory private immutable redeemableERC20Factory;
    RedeemableERC20Unfreezable private _token;

    address private recipient;
    uint256 private minimumRaise;
    IERC20 private _reserve;

    uint256 private remainingUnits;
    uint256 private totalReserveIn;
    SaleStatus private _saleStatus;

    constructor(SaleConstructorConfig memory config_) {
        redeemableERC20Factory = config_.redeemableERC20Factory;
    }

    function initialize(
        SaleConfig memory config_,
        SaleRedeemableERC20Config memory saleRedeemableERC20Config_
    ) external initializer {
        minimumRaise = config_.minimumRaise;

        recipient = config_.recipient;

        _saleStatus = SaleStatus.Pending;

        _reserve = config_.reserve;

        saleRedeemableERC20Config_.erc20Config.distributor = address(this);

        remainingUnits = saleRedeemableERC20Config_.erc20Config.initialSupply;

        RedeemableERC20Unfreezable token_ = RedeemableERC20Unfreezable(
            redeemableERC20Factory.createChild(
                abi.encode(
                    RedeemableERC20Config(
                        address(config_.reserve),
                        saleRedeemableERC20Config_.erc20Config,
                        saleRedeemableERC20Config_
                            .distributionEndForwardingAddress
                    )
                )
            )
        );
        _token = token_;
    }

    /// @inheritdoc ISale
    function token() external view returns (address) {
        return address(_token);
    }

    /// @inheritdoc ISale
    function reserve() external view returns (address) {
        return address(_reserve);
    }

    /// @inheritdoc ISale
    function saleStatus() external view returns (SaleStatus) {
        return _saleStatus;
    }

    function start() external {
        _saleStatus = SaleStatus.Active;
    }

    function end() public {
        remainingUnits = 0;

        bool success_ = totalReserveIn >= minimumRaise;
        SaleStatus endStatus_ = success_ ? SaleStatus.Success : SaleStatus.Fail;
        _saleStatus = endStatus_;

        _token.endDistribution(address(this));

        if (success_) {
            _reserve.safeTransfer(recipient, totalReserveIn);
        }
    }

    function buy(BuyConfig memory config_) external {
        uint256 units_ = config_.desiredUnits.min(remainingUnits);

        uint256 price_ = 75000000; // fixed price for testing

        uint256 cost_ = price_.fixedPointMul(units_);

        remainingUnits -= units_;
        totalReserveIn += cost_;

        _reserve.safeTransferFrom(
            msg.sender,
            address(this),
            cost_ + config_.fee
        );
        IERC20(address(_token)).safeTransfer(msg.sender, units_);

        if (remainingUnits < 1) {
            end();
        }
    }
}
