// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

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
/// is deployed for. If a `Trust` lies about its distribution status then both
/// `undeposit` and `withdraw` calls could succeed/fail inappropriately.
///
/// This mechanism is very similar to the native burn mechanism on
/// `redeemableERC20` itself under `redeem` but without requiring any tokens to
/// be burned in the process. Users can claim the same token many times safely,
/// simply receiving 0 tokens if there is nothing left to claim.
///
/// This does NOT support rebase/elastic token _balance_ mechanisms on the
/// escrowed token as the escrow has no way to track deposits/withdrawals other
/// than 1:1 conservation of input/output. For example, if 100 tokens are
/// deposited under two different trusts and then that token rebases all
/// balances to half, there will be 50 tokens in the escrow but the escrow will
/// attempt transfers up to 100 tokens between the two trusts. Essentially the
/// first 50 tokens will send and the next 50 tokens will fail because the
/// trust literally doesn't have 100 tokens at that point.
///
/// Elastic _supply_ tokens are supported as every token to be withdrawn must
/// be first deposited, with the caveat that if some mechanism can
/// mint/burn/transfer tokens out from under the escrow contract directly, this
/// will break internal accounting much like the rebase situation.
///
/// Using a real-world example, stETH from LIDO would be NOT be supported as
/// the balance changes every day to reflect incoming ETH from validators, but
/// wstETH IS supported as balances remain static while the underlying assets
/// per unit of wstETH increase each day. This is of course exactly why wstETH
/// was created in the first place.
///
/// Every escrowed token has a separate space in the deposited/withdrawn
/// mappings so that some broken/malicious/hacked token that leads to incorrect
/// token movement in/out of the escrow cannot impact other tokens, even for
/// the same trust and redeemable.
contract RedeemableERC20ClaimEscrow is FactoryTruster {
    using Math for uint256;
    using SafeERC20 for IERC20;

    event Deposit(
        address trust,
        address token,
        address depositor,
        uint amount
    );

    event Undeposit(
        address trust,
        address token,
        address undepositor,
        uint amount
    );

    event Withdraw(
        address trust,
        address token,
        address withdrawer,
        uint amount
    );

    /// Every time an address calls `withdraw` their withdrawals increases to
    /// match the current `totalDeposits` for that trust/token combination.
    /// The token amount they actually receive is only their prorata share of
    /// that deposited balance. The prorata scaling calculation happens inline
    /// within the `withdraw` function.
    /// trust => withdrawn token => withdrawer => amount
    mapping(address => mapping(address => mapping(address => uint)))
        public withdrawals;

    /// Every time an address calls `deposit` their deposited trust/token
    /// combination is increased. If they call `undeposit` when the raise has
    /// failed they will receive the full amount they deposited back. Every
    /// depositor must call `undeposit` for themselves.
    /// trust => deposited token => depositor => amount
    mapping(address => mapping(address => mapping(address => uint)))
        public deposits;

    /// Every time an address calls `deposit` the amount is added to that
    /// trust/token combination. This increase becomes the "high water mark"
    /// that withdrawals move up to with each `withdraw` call.
    /// trust => deposited token => amount
    mapping(address => mapping(address => uint)) public totalDeposits;

    ///
    mapping(address => mapping(address => uint)) public maxWithdrawal;

    /// @param trustFactory_ forwarded to `FactoryTruster`.
    constructor(address trustFactory_)
        FactoryTruster(trustFactory_)
        { } // solhint-disable-line no-empty-blocks

    /// Any address can deposit any amount of its own `IERC20` under a `Trust`.
    /// The `Trust` MUST be a child of the trusted factory.
    /// The deposit will be accounted for under both the depositor individually
    /// and the trust in aggregate. The aggregate value is used by `withdraw`
    /// and the individual value by `undeposit`.
    /// The depositor is responsible for approving the token for this contract.
    /// `deposit` is disabled when the distribution fails; only `undeposit` is
    /// allowed in case of a fail. Multiple `deposit` calls before and after a
    /// success result are supported. If a depositor deposits when a raise has
    /// failed they will need to undeposit it again manually.
    /// Delegated `deposit` is not supported. Every depositor is directly
    /// responsible for every `deposit`.
    /// @param trust_ The `Trust` to assign this deposit to.
    /// @param token_ The `IERC20` token to deposit to the escrow.
    /// @param amount_ The amount of token to deposit. Assumes depositor has
    /// approved at least this amount to succeed.
    function deposit(Trust trust_, IERC20 token_, uint amount_)
        external
        onlyTrustedFactoryChild(address(trust_))
    {
        deposits[address(trust_)][address(token_)][msg.sender] += amount_;
        totalDeposits[address(trust_)][address(token_)] += amount_;

        emit Deposit(address(trust_), address(token_), msg.sender, amount_);

        token_.safeTransferFrom(msg.sender, address(this), amount_);
    }

    /// The inverse of `deposit`.
    /// In the case of a failed distribution the depositors can claim back any
    /// tokens they deposited in the escrow.
    /// Ideally the distribution is a success and this does not need to be
    /// called but it is important that we can walk back deposits and try again
    /// for some future raise if needed.
    /// Delegated `undeposit` is not supported, only the depositor can wind
    /// back their original deposit.
    /// `amount_` must be non-zero.
    /// If several tokens have been deposited against a given trust for the
    /// depositor then each token must be individually undeposited. There is
    /// no onchain tracking or bulk processing for the depositor, they are
    /// expected to know what they have previously deposited and if/when to
    /// process an `undeposit`.
    /// @param trust_ The `Trust` to undeposit from.
    /// @param token_ The token to undeposit.
    function undeposit(Trust trust_, IERC20 token_, uint amount_) external {
        require(amount_ > 0, "ZERO_AMOUNT");
        deposits[address(trust_)][address(token_)][msg.sender] -= amount_;
        totalDeposits[address(trust_)][address(token_)] -= amount_;
        emit Undeposit(
            address(trust_),
            address(token_),
            msg.sender,
            amount_
        );

        require(
            trust_.getDistributionStatus() == DistributionStatus.Fail,
            "ONLY_FAIL"
        );
        token_.safeTransfer(msg.sender, amount_);
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
        uint256 totalDeposited_
            = totalDeposits[address(trust_)][address(token_)];
        uint256 withdrawn_
            = withdrawals[address(trust_)][address(token_)][msg.sender];

        if (totalDeposited_ > withdrawn_) {
            withdrawals[address(trust_)][address(token_)][msg.sender]
                = totalDeposited_;

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
                ( totalDeposited_ - withdrawn_ )
                * RedeemableERC20(trustContracts_.redeemableERC20)
                    .balanceOf(msg.sender)
                / RedeemableERC20(trustContracts_.redeemableERC20)
                    .totalSupply()
            );
            emit Withdraw(
                address(trust_),
                address(token_),
                msg.sender,
                amount_
            );
            token_.safeTransfer(
                msg.sender,
                amount_
            );
        }
    }
}