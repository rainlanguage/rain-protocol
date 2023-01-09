// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../interpreter/deploy/IExpressionDeployerV1.sol";
import "../interpreter/run/LibEncodedDispatch.sol";
import "../interpreter/run/LibStackPointer.sol";
import "../interpreter/run/LibContext.sol";
import "../array/LibUint256Array.sol";

import "../tier/TierV2.sol";
import "../tier/libraries/TierConstants.sol";

import "../tier/libraries/TierReport.sol";

import {IERC20MetadataUpgradeable as IERC20Metadata} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/IERC20MetadataUpgradeable.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {ERC4626Upgradeable as ERC4626} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import {SafeCastUpgradeable as SafeCast} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

/// @dev Thrown when the asset being initialized is zero address.
error ZeroAsset();

/// @dev Thrown when the receiver of shares upon deposit is zero address.
error ZeroDepositReceiver();

/// @dev Thrown when the amount of assets being deposited is zero.
error ZeroDepositAssets();

/// @dev Thrown when the amount of shares being minted upon deposit is zero.
error ZeroDepositShares();

/// @dev Thrown when the receiver of assets is zero address on withdrawal.
error ZeroWithdrawReceiver();

/// @dev Thrown when the owner of assets is zero address on withdrawal.
error ZeroWithdrawOwner();

/// @dev Thrown when the amount of assets being withdrawn is zero.
error ZeroWithdrawAssets();

/// @dev Thrown when the amount of shares being burned on withdrawal is zero.
error ZeroWithdrawShares();

/// @dev Entrypoint for calculating the max deposit as per ERC4626.
SourceIndex constant MAX_DEPOSIT_ENTRYPOINT = SourceIndex.wrap(0);
/// @dev Entrypoint for calculating the max withdraw as per ERC4626.
SourceIndex constant MAX_WITHDRAW_ENTRYPOINT = SourceIndex.wrap(1);

/// @dev Minimum required outputs for the max deposit entrypoint.
uint256 constant MAX_DEPOSIT_MIN_OUTPUTS = 1;
/// @dev Minimum required outputs for the max withdraw entrypoint.
uint256 constant MAX_WITHDRAW_MIN_OUTPUTS = 1;

/// @dev Maximum usable outputs for the max deposit entrypoint.
uint256 constant MAX_DEPOSIT_MAX_OUTPUTS = 1;
/// @dev Maximum usable outputs for the max withdraw entrypoint.
uint256 constant MAX_WITHDRAW_MAX_OUTPUTS = 1;

/// Configuration required to initialized the Stake contract.
/// @param asset The underlying ERC20 asset for the 4626 vault.
/// @param name ERC20 name of the 4626 share token to be minted.
/// @param symbol ERC20 symbol of the 4626 share token to be minted.
/// @param expressionDeployer the address of the `IExpressionDeployerV1`.
/// @param interpreter the address of the `IInterpreterV1`.
/// @param stateConfig the expression to calculate max deposits and withdrawals.
struct StakeConfig {
    IERC20Metadata asset;
    string name;
    string symbol;
    address expressionDeployer;
    address interpreter;
    StateConfig stateConfig;
}

/// Similar to OpenZeppelin voting checkpoints. Consists of a timestamp and some
/// amount. The timestamp is 32 bits leaving "only" 224 bits for the amount.
/// The use case is
/// @param timestamp
/// @param amount Largest value we can squeeze into a uint256 alongside a
/// uint32.
struct DepositRecord {
    uint32 timestamp;
    uint224 amount;
}

/// @title Stake
/// @notice Extension of ERC4626 and implementation of `ITierV2` that records all
/// mints and burns of the ERC4626 share token. `ITierV2` reports can be
/// generated according to the internal ledger of share mints. The `ITierV2`
/// context is treated as a list of thresholds that the owner must have minted
/// corresponding shares for. As per `ITierV2` the times that the owner minted
/// each threshold's amount of shares will be returned as a standard `ITierV2`
/// encoded report.
///
/// As per ERC4626 shares are minted according to prorata deposits of the
/// underlying asset defined at initialization. For example, increasing the total
/// assets deposited by 10% entitles the depositor to increase the total supply
/// of share tokens by 10%, minted for themselves on their ledger. Burns are the
/// inverse logic, e.g. burning 10% of the share supply releases 10% of the
/// underlying asset.
///
/// The dual ERC4626/ITierV2 implementation allows for native hybrid incentives.
///
/// The underlying ERC4626 asset can be transferred directly to `Stake` without
/// minting any shares for the transfer. This effectively distributes those
/// assets prorata between all shares outstanding at that moment. Subsequent
/// share mints and burns will calculate against this larger underlying asset
/// pool. I.e. new entrants have to provide more assets to mint the same number
/// of shares and existing holders receive more assets per share when they burn
/// than when they deposited.
///
/// At the same time, the staking ledger is exposed dynamically to incoming
/// `report` calls according to runtime thresholds. This allows external
/// incentives/access to be defined and updated over time. A single staking
/// ledger could be reinterpreted for use in many external tier-based algorithms.
/// For example, users could lose access to some exclusive event/group unless
/// they periodically increase their share ledger to a minimum by some deadline.
/// The external group simply winds up the thresholds passed as context to
/// `report` over time and the existing ledger is reinterpreted accordingly.
///
/// Deposits and withdrawals are throttled/gated behind a deployed expression
/// that is interpreted to calculate the maximum deposit and withdrawal values
/// as per ERC4626.
///
/// Note that the total shares in circulation and the totals of the final entries
/// in every account's ledgers is always 1:1. `Stake` doesn't allow for
/// expressing inflationary tokenomics in the share token itself. Third party
/// tokens may mint/burn themselves according to the share balances and ledger
/// reports provided by `Stake`.
contract Stake is ERC4626, TierV2, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;
    using Math for uint256;
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];
    using LibStackPointer for uint256[];
    using LibStackPointer for StackPointer;

    /// Emitted when the contract initializes.
    /// @param sender msg.sender that initializes the contract.
    /// @param config All config that initialized the contract.
    event Initialize(address sender, StakeConfig config);

    /// The ledger that records the time and amount of all share mints and burns.
    mapping(address => DepositRecord[]) public depositRecords;

    /// The interpreter that evaluates max deposits and withdrawal limits.
    IInterpreterV1 internal interpreter;

    /// The onchain address of the deployed expression.
    address internal expression;

    /// The encoded dispatch of the max deposit entrypoint.
    EncodedDispatch internal dispatchMaxDeposit;

    /// The encoded dispatch of the max withdraw entrypoint.
    EncodedDispatch internal dispatchMaxWithdraw;

    /// Constructor does nothing but prevents accidental initialization of an
    /// implementation template intended to be referenced by a cloning factory.
    constructor() {
        _disableInitializers();
    }

    /// Initializes the `Stake` contract in a proxy compatible way to support
    /// cloning many staking contracts from a single onchain factory.
    /// @param config_ All the initialization config.
    function initialize(StakeConfig calldata config_) external initializer {
        if (address(config_.asset) == address(0)) {
            revert ZeroAsset();
        }
        __ReentrancyGuard_init();
        __ERC20_init(config_.name, config_.symbol);
        __ERC4626_init(config_.asset);
        __TierV2_init();
        interpreter = IInterpreterV1(config_.interpreter);
        address expression_ = IExpressionDeployerV1(config_.expressionDeployer)
            .deployExpression(
                config_.stateConfig,
                LibUint256Array.arrayFrom(
                    MAX_DEPOSIT_MIN_OUTPUTS,
                    MAX_WITHDRAW_MIN_OUTPUTS
                )
            );
        expression = expression_;
        emit Initialize(msg.sender, config_);
    }

    /// General purpose eval for setting context, dispatching and catching the
    /// result to downcast to `0` in the case of an external error.
    /// @param dispatch_ The encoded dispatch to pass to the interpreter for
    /// logic dispatch.
    /// @param account_ The account to add to context, e.g. the receiver or owner
    /// that is depositing or withdrawing.
    /// @return The eval'd amount or `0` if there was an error during `eval` that
    /// prevents an amount from being calculated.
    function _eval(
        EncodedDispatch dispatch_,
        address account_
    ) internal view returns (uint256, IInterpreterStoreV1, uint256[] memory) {
        // ERC4626 mandates that maxDeposit MUST NOT revert. Any error must be
        // caught and converted to a 0 max deposit. Note that `try` MAY NOT catch
        // every error if the interpreter eval is sufficiently malformed the call
        // will revert despite the `try`. For a well behaved expression on a well
        // behaved interpreter the class of errors possible will be caught by the
        // `try` and this will perform according to 4626 spec.
        try
            interpreter.eval(
                DEFAULT_STATE_NAMESPACE,
                dispatch_,
                // Sadly there's no affordance in ERC4626 to allow either signed
                // context or much in the way of caller context.
                LibContext.build(
                    new uint256[][](0),
                    // We put the account being eval'd against as a single item
                    // in caller context and that's the best we can do.
                    uint256(uint160(account_)).arrayFrom(),
                    new SignedContext[](0)
                )
            )
        returns (
            uint256[] memory stack_,
            IInterpreterStoreV1 store_,
            uint256[] memory kvs_
        ) {
            // Guard against a 0 length stack, which well behaved expression
            // deployers and interpreters should never return, but in case we
            // hit this codepath return `0` instead of reverting.
            if (stack_.length == 0) {
                return (0, IInterpreterStoreV1(address(0)), new uint256[](0));
            } else {
                unchecked {
                    return (stack_[stack_.length - 1], store_, kvs_);
                }
            }
        } catch {
            return (0, IInterpreterStoreV1(address(0)), new uint256[](0));
        }
    }

    /// Encodes a dispatch for the max deposit calculations.
    /// @return The encoded dispatch for a max deposit calculation.
    function _dispatchMaxDeposit() internal view returns (EncodedDispatch) {
        return
            LibEncodedDispatch.encode(
                expression,
                MAX_DEPOSIT_ENTRYPOINT,
                MAX_DEPOSIT_MAX_OUTPUTS
            );
    }

    /// Encodes a dispatch for the max withdrawal calculations.
    /// @return The encoded dispatch for a max withdrawal calculation.
    function _dispatchMaxWithdraw() internal view returns (EncodedDispatch) {
        return
            LibEncodedDispatch.encode(
                expression,
                MAX_WITHDRAW_ENTRYPOINT,
                MAX_WITHDRAW_MAX_OUTPUTS
            );
    }

    /// Thin wrapper around _eval for max deposit calculations.
    /// @param receiver_ As per `maxDeposit`.
    function _maxDeposit(
        address receiver_
    ) internal view returns (uint256, IInterpreterStoreV1, uint256[] memory) {
        return _eval(_dispatchMaxDeposit(), receiver_);
    }

    /// Dispatches a max withdraw calculation to the interpreter.
    /// The interpreter expression MAY revert due to internal `ensure` calls or
    /// similar so we have to try/catch down to a `0` value max withdrawal in
    /// that case.
    function _maxWithdraw(
        address owner_
    ) internal view returns (uint256, IInterpreterStoreV1, uint256[] memory) {
        return _eval(_dispatchMaxWithdraw(), owner_);
    }

    /// We will treat the max deposit as whatever the interpreter calculates,
    /// capped to the inherited logic.
    /// @inheritdoc ERC4626
    function maxDeposit(
        address receiver_
    ) public view virtual override returns (uint256) {
        (uint256 maxDeposit_, , ) = _maxDeposit(receiver_);
        return maxDeposit_.min(super.maxDeposit(receiver_));
    }

    /// We will treat our max mint as the share-converted equivalent of our max
    /// deposit as calculated by the interpreter, capped to the inherited logic.
    /// @inheritdoc ERC4626
    function maxMint(
        address receiver_
    ) public view virtual override returns (uint256) {
        // > If (1) it’s calculating how many shares to issue to a user for a
        // > certain amount of the underlying tokens they provide or (2) it’s
        // > determining the amount of the underlying tokens to transfer to them
        // > for returning a certain amount of shares, it should round down.
        (uint256 maxDeposit_, , ) = _maxDeposit(receiver_);
        return
            _convertToShares(maxDeposit_, Math.Rounding.Down).min(
                super.maxMint(receiver_)
            );
    }

    /// @inheritdoc ERC4626
    function maxWithdraw(
        address owner_
    ) public view virtual override returns (uint256) {
        (uint256 maxWithdraw_, , ) = _maxWithdraw(owner_);
        return maxWithdraw_.min(super.maxWithdraw(owner_));
    }

    /// @inheritdoc ERC4626
    function maxRedeem(
        address owner_
    ) public view virtual override returns (uint256) {
        // > If (1) it’s calculating the amount of shares a user has to supply
        // > to receive a given amount of the underlying tokens or (2) it’s
        // > calculating the amount of underlying tokens a user has to provide
        // > to receive a certain amount of shares, it should round up.
        (uint256 maxWithdraw_, , ) = _maxWithdraw(owner_);
        return
            _convertToShares(maxWithdraw_, Math.Rounding.Up).min(
                super.maxRedeem(owner_)
            );
    }

    /// @inheritdoc ERC4626
    function _deposit(
        address caller_,
        address receiver_,
        uint256 assets_,
        uint256 shares_
    ) internal virtual override nonReentrant {
        if (receiver_ == address(0)) {
            revert ZeroDepositReceiver();
        }
        if (assets_ == 0) {
            revert ZeroDepositAssets();
        }
        if (shares_ == 0) {
            revert ZeroDepositShares();
        }

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
        if (receiver_ == address(0)) {
            revert ZeroWithdrawReceiver();
        }
        if (owner_ == address(0)) {
            revert ZeroWithdrawOwner();
        }
        if (assets_ == 0) {
            revert ZeroWithdrawAssets();
        }
        if (shares_ == 0) {
            revert ZeroWithdrawShares();
        }

        // Downgrade ledger first then send assets.
        _removeSharesFromStakingLedger(owner_, shares_);
        super._withdraw(caller_, receiver_, owner_, assets_, shares_);
    }

    /// Add shares to the staking ledger. The ledger records absolute amounts at
    /// as snapshots not relative increments. For example, if the ledger contains
    /// one entry of 100 shares and another 50 shares are minted the second entry
    /// will record 150 shares NOT 50. This is a tradeoff to increase the gas of
    /// writes slightly to significantly decrease the gas and complexity of
    /// subsequent reads.
    /// @param owner_ The owner of the staking ledger that shares are added to.
    /// @param shares_ Amount of shares being added to the ledger.
    function _addSharesToStakingLedger(
        address owner_,
        uint256 shares_
    ) internal {
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

    /// Update the staking ledger so that the given amount of shares are removed.
    /// This involves ensuring the user has enough shares on their ledger total,
    /// then finding the closest entry to the target number of shares remaining
    /// on their ledger. There are a few edge cases near zero to handle but
    /// overall the process is conceptually the same as generating a report and
    /// deleting everything after it. Partial removals of an entry preserve times
    /// but modify amounts.
    ///
    /// Case 1. Adding and removing the same number of shares
    /// - Add 100 shares at index 0 time 0
    /// - Add 100 shares at index 1 time 1
    /// - Remove 200 shares at time 2
    /// - Final ledger is empty (no indexes or times)
    ///
    /// Case 2. Adding and removing a single ledger entry exactly
    /// - Add 100 shares at index 0 time 0
    /// - Add 100 shares at index 1 time 1
    /// - Remove 100 shares at time 2
    /// - Final ledger contains only 100 shares at index 0 time 0
    ///
    /// Case 3. Adding and removing a single ledger entry partially
    /// - Add 100 shares at index 0 time 0
    /// - Add 100 shares at index 1 time 1
    /// - Remove 50 shares at time 2
    /// - Final ledger contains:
    ///   - 100 shares at index 0 time 0
    ///   - 150 shares at index 1 time 1
    ///
    /// Case 4. Adding and removing more than one entry
    /// - Add 100 shares at index 0 time 0
    /// - Add 100 shares at index 1 time 1
    /// - Remove 150 shares at time 2
    /// - Final ledger contains only 50 shares at index 0 time 0
    ///
    /// Case 5. Adding and removing more share than is on the ledger
    /// - Add 100 shares at index 0 time 0
    /// - Add 100 shares at index 1 time 1
    /// - Remove 250 shares at time 2
    /// - ERROR and rollback transaction, final ledger is unmodified
    ///
    /// @param owner_ Owner of the ledger the shares will be removed from.
    /// @param shares_ Amount of shares to remove from the ledger.
    function _removeSharesFromStakingLedger(
        address owner_,
        uint256 shares_
    ) internal {
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
    function report(
        address account_,
        uint256[] calldata context_
    ) external view returns (uint256 report_) {
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

    /// Inspired by the binary search implementation found in OpenZeppelin voting
    /// checkpoints. Modified to fit expected tier/report time logic.
    /// https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v4.5/contracts/utils/Checkpoints.sol#L39
    /// @param account_ Account to lookup times for the threshold for.
    /// @param threshold_ Minimum (gte) amount that must have been deposited by
    /// some time for a timestamp to be considered as relevant.
    /// @param low_ Starting index of binary search. Setting anything other than
    /// 0 will ignore lower indexes. Useful in loops where the previous high_
    /// becomes the subsequent low.
    /// @return high_ The index of the discovered time_.
    /// @return time_ The earliest time deposits were found at or above the
    /// given threshold.
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
