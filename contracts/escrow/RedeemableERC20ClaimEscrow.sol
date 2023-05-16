// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import {RedeemableERC20} from "../redeemableERC20/RedeemableERC20.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "./SaleEscrow.sol";

/// Escrow contract for ERC20 tokens to be deposited and withdrawn against
/// redeemableERC20 tokens from a specific `Sale`.
///
/// When some token is deposited the running total of that token against the
/// trust is incremented by the deposited amount. When some `redeemableERC20`
/// token holder calls `withdraw` they are sent the full balance they have not
/// previously claimed, multiplied by their fraction of the redeemable token
/// supply that they currently hold. As redeemable tokens are frozen after
/// distribution there are no issues with holders manipulating withdrawals by
/// transferring tokens to claim multiple times.
///
/// As redeemable tokens can be burned it is possible for the total supply to
/// decrease over time, which naively would result in claims being larger
/// retroactively (prorata increases beyond what can be paid).
///
/// For example:
/// - Alice and Bob hold 50 rTKN each, 100 total supply
/// - 100 TKN is deposited
/// - Alice withdraws 50% of 100 TKN => alice holds 50 TKN escrow holds 50 TKN
/// - Alice burns her 50 rTKN
/// - Bob attempts to withdraw his 50 rTKN which is now 100% of supply
/// - Escrow tries to pay 100% of 100 TKN deposited and fails as the escrow
///   only holds 50 TKN (alice + bob = 150%).
///
/// To avoid the escrow allowing more withdrawals than deposits we include the
/// total rTKN supply in the key of each deposit mapping, and include it in the
/// emmitted event. Alice and Bob must read the events offchain and make a
/// withdrawal relative to the rTKN supply as it was at deposit time. Many
/// deposits can be made under a single rTKN supply and will all combine to a
/// single withdrawal but deposits made across different supplies will require
/// multiple withdrawals.
///
/// Alice or Bob could burn their tokens before withdrawing and would simply
/// withdraw zero or only some of the deposited TKN. This hurts them
/// individually, so they SHOULD check their indexer for claimable assets in
/// the escrow before considering a burn. But neither of them can cause the
/// other to be able to withdraw more or less relative to the supply as it was
/// at the time of TKN being deposited, or to trick the escrow into overpaying
/// more TKN than was deposited under a given `Sale`.
///
/// A griefer could attempt to flood the escrow with many dust deposits under
/// many different supplies in an attempt to confuse alice/bob. They are free
/// to filter out events in their indexer that come from an unknown depositor
/// or fall below some dust value threshold.
///
/// Tokens may also exit the escrow as an `undeposit` call where the depositor
/// receives back the tokens they deposited. As above the depositor must
/// provide the rTKN supply from `deposit` time in order to `undeposit`.
///
/// As `withdraw` and `undeposit` both represent claims on the same tokens they
/// are mutually exclusive outcomes, hence the need for an escrow. The escrow
/// will process `withdraw` only if the `Sale` is reporting a complete and
/// successful raise. Similarly `undeposit` will only return tokens after the
/// `Sale` completes and reports failure. While the `Sale` is in active
/// distribution neither `withdraw` or `undeposit` will move tokens. This is
/// necessary in part because it is only safe to calculate entitlements once
/// the redeemable tokens are fully distributed and frozen.
///
/// Because much of the redeemable token supply will never be sold, and then
/// burned, `depositPending` MUST be called rather than `deposit` while the
/// raise is active. When the raise completes anon can call `sweepPending`
/// which will calculate and emit a `Deposit` event for a useful `supply`.
///
/// Any supported ERC20 token can be deposited at any time BUT ONLY under a
/// `Sale` contract that is the child of the `TrustFactory` that the escrow
/// is deployed for. `TrustEscrow` is used to prevent a `Sale` from changing
/// the pass/fail outcome once it is known due to a bug/attempt to double
/// spend escrow funds.
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
contract RedeemableERC20ClaimEscrow is SaleEscrow {
    using Math for uint256;
    using SafeERC20 for IERC20;

    /// Emitted for every successful pending deposit.
    /// @param sender Anon `msg.sender` depositing the token.
    /// @param sale `ISale` contract deposit is under.
    /// @param redeemable Redeemable token that can claim this deposit.
    /// Implicitly snapshots the redeemable so malicious `Trust` cannot
    /// redirect funds later.
    /// @param token `IERC20` token being deposited.
    /// @param amount Amount of token deposited.
    event PendingDeposit(
        address sender,
        address sale,
        address redeemable,
        address token,
        uint256 amount
    );

    /// Emitted every time a pending deposit is swept to a full deposit.
    /// @param sender Anon `msg.sender` sweeping the deposit.
    /// @param depositor Anon `msg.sender` who originally deposited the token.
    /// @param sale `ISale` contract deposit is under.
    /// @param redeemable Redeemable token first reported by the trust.
    /// @param token `IERC20` token being swept into a deposit.
    /// @param amount Amount of token being swept into a deposit.
    event Sweep(
        address sender,
        address depositor,
        address sale,
        address redeemable,
        address token,
        uint256 amount
    );

    /// Emitted for every successful deposit.
    /// @param sender Anon `msg.sender` triggering the deposit.
    /// MAY NOT be the `depositor` in the case of a pending sweep.
    /// @param depositor Anon `msg.sender` who originally deposited the token.
    /// MAY NOT be the current `msg.sender` in the case of a pending sweep.
    /// @param sale `ISale` contract deposit is under.
    /// @param redeemable Redeemable token that can claim this deposit.
    /// @param token `IERC20` token being deposited.
    /// @param supply rTKN supply at moment of deposit.
    /// @param amount Amount of token deposited.
    event Deposit(
        address sender,
        address depositor,
        address sale,
        address redeemable,
        address token,
        uint256 supply,
        uint256 amount
    );

    /// Emitted for every successful undeposit.
    /// @param sender Anon `msg.sender` undepositing the token.
    /// @param sale `ISale` contract undeposit is from.
    /// @param redeemable Redeemable token that is being undeposited against.
    /// @param token `IERC20` token being undeposited.
    /// @param supply rTKN supply at moment of deposit.
    /// @param amount Amount of token undeposited.
    event Undeposit(
        address sender,
        address sale,
        address redeemable,
        address token,
        uint256 supply,
        uint256 amount
    );

    /// Emitted for every successful withdrawal.
    /// @param withdrawer Anon `msg.sender` withdrawing the token.
    /// @param sale `ISale` contract withdrawal is from.
    /// @param redeemable Redeemable token used to withdraw.
    /// @param token `IERC20` token being withdrawn.
    /// @param supply rTKN supply at moment of deposit.
    /// @param amount Amount of token withdrawn.
    event Withdraw(
        address withdrawer,
        address sale,
        address redeemable,
        address token,
        uint256 supply,
        uint256 amount
    );

    /// Every time an address calls `withdraw` their withdrawals increases to
    /// match the current `totalDeposits` for that trust/token combination.
    /// The token amount they actually receive is only their prorata share of
    /// that deposited balance. The prorata scaling calculation happens inline
    /// within the `withdraw` function.
    /// trust => withdrawn token =>  rTKN supply => withdrawer => amount
    mapping(address => mapping(address => mapping(uint256 => mapping(address => uint256))))
        internal withdrawals;

    /// Deposits during an active raise are desirable to trustlessly prove to
    /// raise participants that they will in fact be able to access the TKN
    /// after the raise succeeds. Deposits during the pending stage are set
    /// aside with no rTKN supply mapping, to be swept into a real deposit by
    /// anon once the raise completes.
    mapping(address => mapping(address => mapping(address => uint256)))
        internal pendingDeposits;

    /// Every time an address calls `deposit` their deposited trust/token
    /// combination is increased. If they call `undeposit` when the raise has
    /// failed they will receive the full amount they deposited back. Every
    /// depositor must call `undeposit` for themselves.
    /// trust => deposited token => depositor => rTKN supply => amount
    mapping(address => mapping(address => mapping(address => mapping(uint256 => uint256))))
        internal deposits;

    /// Every time an address calls `deposit` the amount is added to that
    /// trust/token/supply combination. This increase becomes the
    /// "high water mark" that withdrawals move up to with each `withdraw`
    /// call.
    /// trust => deposited token => rTKN supply => amount
    mapping(address => mapping(address => mapping(uint256 => uint256)))
        internal totalDeposits;

    /// Redundant tracking of deposits withdrawn.
    /// Counts aggregate deposits down as users withdraw, while their own
    /// individual withdrawal counters count up.
    /// Guards against buggy/malicious redeemable tokens that don't correctly
    /// freeze their balances, hence opening up double spends.
    /// trust => deposited token => rTKN supply => amount
    mapping(address => mapping(address => mapping(uint256 => uint256)))
        internal remainingDeposits;

    /// Depositor can set aside tokens during pending raise status to be swept
    /// into a real deposit later.
    /// The problem with doing a normal deposit while the raise is still active
    /// is that the `Sale` will burn all unsold tokens when the raise ends. If
    /// we captured the token supply mid-raise then many deposited TKN would
    /// be allocated to unsold rTKN. Instead we set aside TKN so that raise
    /// participants can be sure that they will be claimable upon raise success
    /// but they remain unbound to any rTKN supply until `sweepPending` is
    /// called.
    /// `depositPending` is a one-way function, there is no way to `undeposit`
    /// until after the raise fails. Strongly recommended that depositors do
    /// NOT call `depositPending` until raise starts, so they know it will also
    /// end.
    /// @param sale_ The `Sale` to assign this deposit to.
    /// @param token_ The `IERC20` token to deposit to the escrow.
    /// @param amount_ The amount of token to despoit. Requires depositor has
    /// approved at least this amount to succeed.
    function depositPending(
        address sale_,
        address token_,
        uint256 amount_
    ) external {
        require(amount_ > 0, "ZERO_DEPOSIT");
        require(escrowStatus(sale_) == EscrowStatus.Pending, "NOT_PENDING");
        pendingDeposits[sale_][token_][msg.sender] += amount_;
        // Important to snapshot the token from the trust here so it can't be
        // changed later by the trust.
        address redeemable_ = token(sale_);

        emit PendingDeposit(msg.sender, sale_, redeemable_, token_, amount_);

        IERC20(token_).safeTransferFrom(msg.sender, address(this), amount_);
    }

    /// Internal accounting for a deposit.
    /// Identical for both a direct deposit and sweeping a pending deposit.
    /// @param sale_ The sale to register a deposit under.
    /// @param token_ The token being deposited.
    /// @param depositor_ The depositor address to register the deposit under.
    /// @param amount_ The size of the deposit denominated in `token_`.
    function registerDeposit(
        address sale_,
        address token_,
        address depositor_,
        uint256 amount_
    ) private {
        require(escrowStatus(sale_) > EscrowStatus.Pending, "PENDING");
        require(amount_ > 0, "ZERO_DEPOSIT");

        address redeemable_ = token(sale_);
        uint256 supply_ = IERC20(redeemable_).totalSupply();
        // Zero supply means the escrow is at best useless (no recipients) and
        // at worst dangerous (tokens trapped behind a divide by zero).
        require(supply_ > 0, "ZERO_SUPPLY");

        deposits[sale_][token_][depositor_][supply_] += amount_;
        totalDeposits[sale_][token_][supply_] += amount_;
        remainingDeposits[sale_][token_][supply_] += amount_;

        emit Deposit(
            msg.sender,
            depositor_,
            sale_,
            redeemable_,
            token_,
            supply_,
            amount_
        );
    }

    /// Anon can convert any existing pending deposit to a deposit with known
    /// rTKN supply once the escrow has moved out of pending status.
    /// As `sweepPending` is anon callable, raise participants know that the
    /// depositor cannot later prevent a sweep, and depositor knows that raise
    /// participants cannot prevent a sweep. As per normal deposits, the output
    /// of swept tokens depends on success/fail state allowing `undeposit` or
    /// `withdraw` to be called subsequently.
    /// Partial sweeps are NOT supported, to avoid griefers splitting a deposit
    /// across many different `supply_` values.
    /// @param sale_ The sale to sweep all pending deposits for.
    /// @param token_ The token to sweep into registered deposits.
    /// @param depositor_ The depositor to sweep registered deposits under.
    function sweepPending(
        address sale_,
        address token_,
        address depositor_
    ) external {
        uint256 amount_ = pendingDeposits[sale_][token_][depositor_];
        delete pendingDeposits[sale_][token_][depositor_];
        emit Sweep(
            msg.sender,
            depositor_,
            sale_,
            token(sale_),
            token_,
            amount_
        );
        registerDeposit(sale_, token_, depositor_, amount_);
    }

    /// Any address can deposit any amount of its own `IERC20` under a `Sale`.
    /// The `Sale` MUST be a child of the trusted factory.
    /// The deposit will be accounted for under both the depositor individually
    /// and the trust in aggregate. The aggregate value is used by `withdraw`
    /// and the individual value by `undeposit`.
    /// The depositor is responsible for approving the token for this contract.
    /// `deposit` is still enabled after the distribution ends; `undeposit` is
    /// always allowed in case of a fail and disabled on success. Multiple
    /// `deposit` calls before and after a success result are supported. If a
    /// depositor deposits when a raise has failed they will need to undeposit
    /// it again manually.
    /// Delegated `deposit` is not supported. Every depositor is directly
    /// responsible for every `deposit`.
    /// WARNING: As `undeposit` can only be called when the `Sale` reports
    /// failure, `deposit` should only be called when the caller is sure the
    /// `Sale` will reach a clear success/fail status. For example, when a
    /// `Sale` has not yet been seeded it may never even start the raise so
    /// depositing at this point is dangerous. If the `Sale` never starts the
    /// raise it will never fail the raise either.
    /// @param sale_ The `Sale` to assign this deposit to.
    /// @param token_ The `IERC20` token to deposit to the escrow.
    /// @param amount_ The amount of token to deposit. Requires depositor has
    /// approved at least this amount to succeed.
    function deposit(address sale_, address token_, uint256 amount_) external {
        registerDeposit(sale_, token_, msg.sender, amount_);
        IERC20(token_).safeTransferFrom(msg.sender, address(this), amount_);
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
    /// @param sale_ The `Sale` to undeposit from.
    /// @param token_ The token to undeposit.
    /// @param supply_ The total supply of the sale token associated with the
    /// deposit being undeposited.
    /// @param amount_ The amount to undeposit.
    function undeposit(
        address sale_,
        address token_,
        uint256 supply_,
        uint256 amount_
    ) external {
        // Can only undeposit when the `Trust` reports failure.
        require(escrowStatus(sale_) == EscrowStatus.Fail, "NOT_FAIL");
        require(amount_ > 0, "ZERO_AMOUNT");

        deposits[sale_][token_][msg.sender][supply_] -= amount_;
        // Guard against outputs exceeding inputs.
        // Last undeposit gets a gas refund.
        totalDeposits[sale_][token_][supply_] -= amount_;
        remainingDeposits[sale_][token_][supply_] -= amount_;

        emit Undeposit(
            msg.sender,
            sale_,
            // Include this in the event so that indexer consumers see a
            // consistent world view even if the trust_ changes its answer
            // about the redeemable.
            token(sale_),
            token_,
            supply_,
            amount_
        );

        IERC20(token_).safeTransfer(msg.sender, amount_);
    }

    /// The successful handover of a `deposit` to a recipient.
    /// When a redeemable token distribution is successful the redeemable token
    /// holders are automatically and immediately eligible to `withdraw` any
    /// and all tokens previously deposited against the relevant `Sale`.
    /// The `withdraw` can only happen if/when the relevant `Sale` reaches the
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
    /// are withdrawn`. 0 amount withdrawal is an error, if the prorata share
    /// of the token being claimed is small enough to round down to 0 then the
    /// withdraw will revert.
    /// Multiple withdrawals across multiple deposits is supported and is
    /// equivalent to a single withdraw after all relevant deposits.
    /// @param sale_ The trust to `withdraw` against.
    /// @param token_ The token to `withdraw`.
    /// @param supply_ The total supply of the sale token at time of deposit
    /// to process this withdrawal against.
    function withdraw(address sale_, address token_, uint256 supply_) external {
        // Can only withdraw when the `Trust` reports success.
        require(escrowStatus(sale_) == EscrowStatus.Success, "NOT_SUCCESS");

        uint256 totalDeposited_ = totalDeposits[sale_][token_][supply_];
        uint256 withdrawn_ = withdrawals[sale_][token_][supply_][msg.sender];
        withdrawals[sale_][token_][supply_][msg.sender] = totalDeposited_;

        RedeemableERC20 redeemable_ = RedeemableERC20(token(sale_));

        uint256 amount_ = (totalDeposited_ - withdrawn_).mulDiv( // dust, for example. // receive less, so 0/33/33 from 100 with 34 TKN as escrow // for example. If someone burns before withdrawing they will // 3 ways will be 33 tokens each, leaving 1 TKN as escrow dust, // all get a share rounded down by integer division. 100 split // as at the time deposit was made. If nobody burns they will // prorata share of `msg.sender`'s current balance vs. supply // Underflow MUST error here (should not be possible).
            redeemable_.balanceOf(msg.sender),
            supply_
        );

        // Guard against outputs exceeding inputs.
        // For example a malicious `Trust` could report a `redeemable_` token
        // that does NOT freeze balances. In this case token holders can double
        // spend their withdrawals by simply shuffling the same token around
        // between accounts.
        remainingDeposits[sale_][token_][supply_] -= amount_;

        require(amount_ > 0, "ZERO_WITHDRAW");
        emit Withdraw(
            msg.sender,
            sale_,
            address(redeemable_),
            token_,
            supply_,
            amount_
        );
        IERC20(token_).safeTransfer(msg.sender, amount_);
    }
}
