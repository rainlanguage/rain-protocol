// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { Trust, DistributionStatus, TrustContracts } from "../trust/Trust.sol";
import { TrustFactory } from "../trust/TrustFactory.sol";
import { RedeemableERC20 } from "../redeemableERC20/RedeemableERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract RedeemableERC20ClaimEscrow {
    using SafeMath for uint256;
    using Math for uint256;
    using SafeERC20 for IERC20;

    TrustFactory public immutable trustFactory;

    // trust => withdrawn token => withdrawer => amount
    mapping(address => mapping(address => mapping(address => uint256)))
        public withdrawals;

    // trust => deposited token => depositor => amount
    mapping(address => mapping(address => mapping(address => uint256)))
        public deposits;
    // trust => deposited token => amount
    mapping(address => mapping(address => uint256)) public totalDeposits;

    constructor(TrustFactory trustFactory_) public {
        trustFactory = trustFactory_;
    }

    function deposit(Trust trust_, IERC20 token_, uint256 amount_) public {
        require(
            trustFactory.isChild(address(trust_)),
            "FACTORY_CONTRACT"
        );
        deposits[address(trust_)][address(token_)][msg.sender]
            = deposits[address(trust_)][address(token_)][msg.sender]
                .add(amount_);
        totalDeposits[address(trust_)][address(token_)]
            = totalDeposits[address(trust_)][address(token_)].add(amount_);

        require(
            trust_.getDistributionStatus() != DistributionStatus.Fail,
            "FAIL_DEPOSIT"
        );

        token_.safeTransferFrom(msg.sender, address(this), amount_);
    }

    function undeposit(Trust trust_, IERC20 token_) public {
        uint256 amount_
            = deposits[address(trust_)][address(token_)][msg.sender];
        if (amount_ > 0) {
            delete deposits[address(trust_)][address(token_)][msg.sender];
            totalDeposits[address(trust_)][address(token_)]
                = totalDeposits[address(trust_)][address(token_)].sub(amount_);

            require(
                trust_.getDistributionStatus() == DistributionStatus.Fail,
                "ONLY_FAIL"
            );

            token_.safeTransfer(msg.sender, amount_);
        }
    }

    function withdraw(Trust trust_, IERC20 token_) public {
        uint256 totalDeposit_
            = totalDeposits[address(trust_)][address(token_)];
        uint256 withdrawn_
            = withdrawals[address(trust_)][address(token_)][msg.sender];

        if (totalDeposit_ > withdrawn_) {
            withdrawals[address(trust_)][address(token_)][msg.sender]
                = totalDeposit_;

            require(
                trust_.getDistributionStatus() == DistributionStatus.Success,
                "ONLY_SUCCESS"
            );
            TrustContracts memory trustContracts_ = trust_.getContracts();
            token_.safeTransfer(
                msg.sender,
                totalDeposit_.sub(withdrawn_).mul(
                    RedeemableERC20(trustContracts_.redeemableERC20)
                        .balanceOf(msg.sender)
                )
                .div(
                    RedeemableERC20(trustContracts_.redeemableERC20)
                        .totalSupply()
                )
                // Guard against rounding errors blocking the last withdraw.
                // The issue would be if rounding errors in the withdrawal
                // trigger an attempt to withdraw more redeemable than is owned
                // by the escrow.
                // IMPORTANT: Rounding errors in the inverse direction, i.e.
                // that leave dust trapped in the escrow after all accounts
                // have fully withdrawn are NOT guarded against.
                // For example, if 100 tokens are split between 3 accounts then
                // each account will receive 33 tokens, effectively burning 1
                // token as it cannot be withdrawn from the escrow contract.
                .min(
                    token_.balanceOf(address(this))
                )
            );
        }
    }
}