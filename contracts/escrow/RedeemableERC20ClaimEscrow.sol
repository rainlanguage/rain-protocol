// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { IFactory } from "../factory/IFactory.sol";
import { FactoryTruster } from "../factory/FactoryTruster.sol";
import { Trust, DistributionStatus, TrustContracts } from "../trust/Trust.sol";
import { RedeemableERC20 } from "../redeemableERC20/RedeemableERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// Escrow contract for ERC20 tokens to be deposited and withdrawn against
/// redeemableERC20 tokens from a specific `Trust`.
///
/// When some token is deposited the running total of that token against the
/// trust is incremented by the deposited amount. When some `redeemableERC20`
/// token holder calls `withdraw` they are sent the full balance they have not
/// previously claimed, multiplied by their fraction of the redeemable token
/// supply that they currently hold. As redeemable tokens are frozen after
/// distribution there are no issues with holders manipulating withdrawals by
/// transferring tokens to claim multiple times.
///
/// Tokens may also exit the escrow as an `undeposit` call where the depositor
/// receives back the tokens they deposited.
///
/// As `withdraw` and `undeposit` both represent claims on the same tokens they
/// are mutually exclusive outcomes, hence the need for an escrow. The escrow
/// will process `withdraw` only if the `Trust` is reporting a complete and
/// successful raise. Similarly `undeposit` will only return tokens after the
/// `Trust` completes and reports failure. While the `Trust` is in active
/// distribution neither `withdraw` or `undeposit` will move tokens. This is
/// necessary in part because it is only safe to calculate entitlements once
/// the redeemable tokens are fully distributed and frozen.
///
/// Any supported ERC20 token can be deposited at any time BUT ONLY under a
/// `Trust` contract that is the child of the `TrustFactory` that the escrow
/// is deployed for. This prevents deposits for some token under a malicious
/// `Trust` that lies about its current distribution status to drain the escrow
/// of funds by "double spending" deposits as both `undeposit` and `withdraw`
/// calls. Both `withdraw` and `undeposit` against an unknown/unfunded `Trust`
/// are noops so there is no additional check against the `TrustFactory` at
/// this point.
///
/// This mechanism is very similar to the native burn mechanism on
/// `redeemableERC20` itself under `redeem` but without requiring any tokens to
/// be burned in the process.
///
/// This does NOT support rebase/elastic token _balance_ mechanisms on the
/// escrowed token as the escrow has no way to track deposits/withdrawals other
/// than 1:1 conservation of input/output. For example, if 100 tokens are
/// deposited and then that token rebases all balances to half, there will be
/// 50 tokens in the escrow, but users will still be able to claim their share
/// of 100 tokens - i.e. they will get paid out twice as much as the escrow
/// actually holds.
///
/// Elastic _supply_ tokens are supported as every token to be withdrawn must
/// be first deposited, with the caveat that if some mechanism can
/// mint/burn/transfer tokens out from under the escrow contract directly, this
/// will break internal accounting much like the rebase situation.
///
/// Using a real-world example, stETH from LIDO would be NOT be supported as
/// the balance changes every day to reflect incoming ETH from validators, but
/// wstETH IS supported as balances remain static while the underlying assets
/// per unit of wstETH increase each day.
///
/// Every escrowed token has a separate space in the deposited/withdrawn
/// mappings so that some broken/malicious/hacked token that leads to incorrect
/// token movement in/out of the escrow cannot impact other tokens, even for
/// the same trust and redeemable.
contract RedeemableERC20ClaimEscrow is FactoryTruster {
    using Math for uint256;
    using SafeERC20 for IERC20;

    event Deposit(
        address indexed trust,
        address indexed token,
        address indexed depositor,
        uint256 amount
    );

    event Undeposit(
        address indexed trust,
        address indexed token,
        address indexed undepositor,
        uint256 amount
    );

    event Withdraw(
        address indexed trust,
        address indexed token,
        address indexed withdrawer,
        uint256 amount
    );

    /// trust => withdrawn token => withdrawer => amount
    mapping(address => mapping(address => mapping(address => uint256)))
        public withdrawals;

    /// trust => deposited token => depositor => amount
    mapping(address => mapping(address => mapping(address => uint256)))
        public deposits;
    /// trust => deposited token => amount
    mapping(address => mapping(address => uint256)) public totalDeposits;

    /// @param trustFactory_ forwarded to `FactoryTruster`.
    constructor(IFactory trustFactory_)
        FactoryTruster(trustFactory_)
        { } //solhint-disable-line no-empty-blocks

    /// Any address can deposit any amount of its own `IERC20` under a `Trust`.
    /// The `Trust` MUST be a child of the trusted factory.
    /// The deposit will be accounted for under both the depositor individually
    /// and the trust in aggregate. The aggregate value is used by `withdraw`
    /// and the individual value by `undeposit`.
    /// The depositor is responsible for approving the token for this contract.
    /// `deposit` is disabled when the distribution fails; only `undeposit` is
    /// allowed in case of a fail. Multiple `deposit` calls before and after a
    /// success result are supported.
    /// Delegated `deposit` is not supported. Every depositor is directly
    /// responsible for every `deposit`.
    /// @param trust_ The `Trust` to assign this deposit to.
    /// @param token_ The `IERC20` token to deposit to the escrow.
    /// @param amount_ The amount of token to deposit. Assumes depositor has
    /// approved at least this amount to succeed.
    function deposit(Trust trust_, IERC20 token_, uint256 amount_)
        external
        onlyTrustedFactoryChild(address(trust_))
    {
        deposits[address(trust_)][address(token_)][msg.sender]
            = amount_ + deposits[address(trust_)][address(token_)][msg.sender];
        totalDeposits[address(trust_)][address(token_)]
            = amount_ + totalDeposits[address(trust_)][address(token_)];

        // Technically a reentrant `require` even though we explicitly trust
        // the `trust_` this helps automated auditing tools.
        require(
            trust_.getDistributionStatus() != DistributionStatus.Fail,
            "FAIL_DEPOSIT"
        );

        token_.safeTransferFrom(msg.sender, address(this), amount_);

        emit Deposit(address(trust_), address(token_), msg.sender, amount_);
    }

    /// The inverse of `deposit`.
    /// In the case of a failed distribution the depositors can claim back any
    /// tokens they deposited in the escrow.
    /// Ideally the distribution is a success and this does not need to be
    /// called but it is important that we can walk back deposits and try again
    /// for some future raise if needed.
    /// Partial `undeposit` is not supported. Several `deposits` under a single
    /// depositor will all be processed as a single `undeposit`.
    /// Delegated `undeposit` is not supported, only the depositor can wind
    /// back their original deposit.
    /// 0 amount `undeposit` is a noop.
    /// If several tokens have been deposited against a given trust for the
    /// depositor then each token must be individually undeposited. There is
    /// no onchain tracking or bulk processing for the depositor, they are
    /// expected to know what they have previously deposited and if/when to
    /// process an `undeposit`.
    /// @param trust_ The `Trust` to undeposit from.
    /// @param token_ The token to undeposit.
    function undeposit(Trust trust_, IERC20 token_) external {
        uint256 amount_
            = deposits[address(trust_)][address(token_)][msg.sender];
        if (amount_ > 0) {
            delete deposits[address(trust_)][address(token_)][msg.sender];
            totalDeposits[address(trust_)][address(token_)]
                = amount_ - totalDeposits[address(trust_)][address(token_)];

            require(
                trust_.getDistributionStatus() == DistributionStatus.Fail,
                "ONLY_FAIL"
            );

            token_.safeTransfer(msg.sender, amount_);

            emit Undeposit(
                address(trust_),
                address(token_),
                msg.sender,
                amount_
            );
        }
    }

    /// The successful handover of a `deposit` to a recipient.
    /// When a redeemable token distribution is successful the redeemable token
    /// holders are automatically and immediately eligible to `withdraw` any
    /// and all tokens previously deposited against the relevant `Trust`.
    /// The `withdraw` can only happen if/when the relevant `Trust` reaches the
    /// success distribution status.
    /// Delegated `withdraw` is NOT supported. Every redeemable token holder is
    /// directly responsible for being aware of and calling `withdraw`.
    /// If a redeemable token holder calls `redeem` they also burn their claim
    /// on any tokens held in escrow so they MUST first call `withdraw` THEN
    /// `redeem`.
    /// It is expected that the redeemable token holder knows about the tokens
    /// that they will be withdrawing. This information is NOT tracked onchain
    /// or exposed for bulk processing.
    /// Partial `withdraw` is not supported, all tokens allocated to the caller
    /// are withdrawn`. 0 amount withdrawal is a noop.
    /// Multiple withdrawals across multiple deposits is supported and is
    /// equivalent to a single withdraw after all relevant deposits.
    /// @param trust_ The trust to `withdraw` against.
    /// @param token_ The token to `withdraw`.
    function withdraw(Trust trust_, IERC20 token_) external {
        uint256 totalDeposit_
            = totalDeposits[address(trust_)][address(token_)];
        uint256 withdrawn_
            = withdrawals[address(trust_)][address(token_)][msg.sender];

        if (totalDeposit_ > withdrawn_) {
            withdrawals[address(trust_)][address(token_)][msg.sender]
                = totalDeposit_;

            // Technically reentrant call to our trusted trust.
            // Called after state changes to help automated audit tools.
            require(
                trust_.getDistributionStatus() == DistributionStatus.Success,
                "ONLY_SUCCESS"
            );
            TrustContracts memory trustContracts_ = trust_.getContracts();
            // Guard against rounding errors blocking the last withdraw.
            // The issue would be if rounding errors in the withdrawal
            // trigger an attempt to withdraw more redeemable than is owned
            // by the escrow. This is probably snake oil because integer
            // division results in flooring rather than rounding up/down.
            // IMPORTANT: Rounding errors in the inverse direction, i.e.
            // that leave dust trapped in the escrow after all accounts
            // have fully withdrawn are NOT guarded against.
            // For example, if 100 tokens are split between 3 accounts then
            // each account will receive 33 tokens, effectively burning 1
            // token as it cannot be withdrawn from the escrow contract.
            uint256 amount_ = token_.balanceOf(address(this)).min(
                ( totalDeposit_ - withdrawn_ )
                * RedeemableERC20(trustContracts_.redeemableERC20)
                    .balanceOf(msg.sender)
                / RedeemableERC20(trustContracts_.redeemableERC20)
                    .totalSupply()
            );
            token_.safeTransfer(
                msg.sender,
                amount_
            );
            emit Withdraw(
                address(trust_),
                address(token_),
                msg.sender,
                amount_
            );
        }
    }
}