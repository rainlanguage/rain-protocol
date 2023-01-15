// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "./IOrderBookV1.sol";
import "./LibOrder.sol";
import "../interpreter/run/LibStackPointer.sol";
import "../math/FixedPointMath.sol";
import "../interpreter/ops/AllStandardOps.sol";
import "./OrderBookFlashLender.sol";
import "../interpreter/run/LibEncodedDispatch.sol";
import "../interpreter/run/LibContext.sol";
import "../interpreter/run/IInterpreterCallerV1.sol";

import {MulticallUpgradeable as Multicall} from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import {ReentrancyGuardUpgradeable as ReentrancyGuard} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

/// Thrown when the `msg.sender` modifying an order is not its owner.
/// @param sender `msg.sender` attempting to modify the order.
/// @param owner The owner of the order.
error NotOrderOwner(address sender, address owner);

/// Thrown when the input and output tokens don't match, in either direction.
/// @param a The input or output of one order.
/// @param b The input or output of the other order that doesn't match a.
error TokenMismatch(address a, address b);

/// Thrown when the minimum input is not met.
/// @param minimumInput The minimum input required.
/// @param input The input that was achieved.
error MinimumInput(uint256 minimumInput, uint256 input);

/// Thrown when two orders have the same owner during clear.
/// @param owner The owner of both orders.
error SameOwner(address owner);

/// @dev Value that signifies that an order is live in the internal mapping.
/// Anything nonzero is equally useful.
uint256 constant LIVE_ORDER = 1;

/// @dev Value that signifies that an order is dead in the internal mapping.
uint256 constant DEAD_ORDER = 0;

/// @dev Entrypoint to a calculate the amount and ratio of an order.
SourceIndex constant CALCULATE_ORDER_ENTRYPOINT = SourceIndex.wrap(0);
/// @dev Entrypoint to handle the final internal vault movements resulting from
/// matching multiple calculated orders.
SourceIndex constant HANDLE_IO_ENTRYPOINT = SourceIndex.wrap(1);

/// @dev Minimum outputs for calculate order are the amount and ratio.
uint256 constant CALCULATE_ORDER_MIN_OUTPUTS = 2;
/// @dev Maximum outputs for calculate order are the amount and ratio.
uint256 constant CALCULATE_ORDER_MAX_OUTPUTS = 2;

/// @dev Handle IO has no outputs as it only responds to vault movements.
uint256 constant HANDLE_IO_MIN_OUTPUTS = 0;
/// @dev Handle IO has no outputs as it only response to vault movements.
uint256 constant HANDLE_IO_MAX_OUTPUTS = 0;

/// @dev Orderbook context is actually fairly complex. The calling context column
/// is populated before calculate order, but the remaining columns are only
/// available to handle IO as they depend on the full evaluation of calculuate
/// order, and cross referencing against the same from the counterparty, as well
/// as accounting limits such as current vault balances, etc.
/// The token address and decimals for vault inputs and outputs IS available to
/// the calculate order entrypoint, but not the final vault balances/diff.
uint256 constant CONTEXT_COLUMNS = 4;
/// @dev Contextual data available to both calculate order and handle IO. The
/// order hash, order owner and order counterparty. IMPORTANT NOTE that the
/// typical base context of an order with the caller will often be an unrelated
/// clearer of the order rather than the owner or counterparty.
uint256 constant CONTEXT_CALLING_CONTEXT_COLUMN = 0;
/// @dev Calculations column contains the DECIMAL RESCALED calculations but
/// otherwise provided as-is according to calculate order entrypoint
uint256 constant CONTEXT_CALCULATIONS_COLUMN = 1;
/// @dev Vault inputs are the literal token amounts and vault balances before and
/// after for the input token from the perspective of the order. MAY be
/// significantly different to the calculated amount due to insufficient vault
/// balances from either the owner or counterparty, etc.
uint256 constant CONTEXT_VAULT_INPUTS_COLUMN = 2;
/// @dev Vault outputs are the same as vault inputs but for the output token from
/// the perspective of the order.
uint256 constant CONTEXT_VAULT_OUTPUTS_COLUMN = 3;

/// @dev Row of the token address for vault inputs and outputs columns.
uint256 constant CONTEXT_VAULT_IO_TOKEN = 0;
/// @dev Row of the token decimals for vault inputs and outputs columns.
uint256 constant CONTEXT_VAULT_IO_TOKEN_DECIMALS = 1;
/// @dev Row of the vault ID for vault inputs and outputs columns.
uint256 constant CONTEXT_VAULT_IO_VAULT_ID = 2;
/// @dev Row of the vault balance before the order was cleared for vault inputs
/// and outputs columns.
uint256 constant CONTEXT_VAULT_IO_BALANCE_BEFORE = 3;
/// @dev Row of the vault balance difference after the order was cleared for
/// vault inputs and outputs columns. The diff is ALWAYS POSITIVE as it is a
/// `uint256` so it must be added to input balances and subtraced from output
/// balances.
uint256 constant CONTEXT_VAULT_IO_BALANCE_DIFF = 4;
/// @dev Length of a vault IO column.
uint256 constant CONTEXT_VAULT_IO_ROWS = 5;

/// Summary of the vault state changes due to clearing an order. NOT the state
/// changes sent to the interpreter store, these are the LOCAL CHANGES in vault
/// balances. Note that the difference in inputs/outputs overall between the
/// counterparties is the bounty paid to the entity that cleared the order.
/// @param aOutput Amount of counterparty A's output token that moved out of
/// their vault.
/// @param bOutput Amount of counterparty B's output token that moved out of
/// their vault.
/// @param aInput Amount of counterparty A's input token that moved into their
/// vault.
/// @param bInput Amount of counterparty B's input token that moved into their
/// vault.
struct ClearStateChange {
    uint256 aOutput;
    uint256 bOutput;
    uint256 aInput;
    uint256 bInput;
}

/// All information resulting from an order calculation that allows for vault IO
/// to be calculated and applied, then the handle IO entrypoint to be dispatched.
/// @param outputMax The UNSCALED maximum output calculated by the order
/// expression. WILL BE RESCALED ACCORDING TO TOKEN DECIMALS to an 18 fixed
/// point decimal number for the purpose of calculating actual vault movements.
/// The output max is CAPPED AT THE OUTPUT VAULT BALANCE OF THE ORDER OWNER.
/// The order is guaranteed that the total output of this single clearance cannot
/// exceed this (subject to rescaling). It is up to the order expression to track
/// values over time if the output max is to impose a global limit across many
/// transactions and counterparties.
/// @param IORatio The UNSCALED order ratio as input/output from the perspective
/// of the order. As each counterparty's input is the other's output, the IORatio
/// calculated by each order is inverse of its counterparty. IORatio is SCALED
/// ACCORDING TO TOKEN DECIMALS to allow 18 decimal fixed point math over the
/// vault balances. I.e. `1e18` returned from the expression is ALWAYS "one" as
/// ECONOMIC EQUIVALENCE between two tokens, but this will be rescaled according
/// to the decimals of the token. For example, if DAI and USDT have a ratio of
/// `1e18` then in reality `1e12` DAI will move in the vault for every `1` USDT
/// that moves, because DAI has `1e18` decimals per $1 peg and USDT has `1e6`
/// decimals per $1 peg. THE ORDER DEFINES THE DECIMALS for each token, NOT the
/// token itself, because the token MAY NOT report its decimals as per it being
/// optional in the ERC20 specification.
/// @param context The entire 2D context array, initialized from the context
/// passed into the order calculations and then populated with the order
/// calculations and vault IO before being passed back to handle IO entrypoint.
/// @param store The `IInterpreterStoreV1` returned from the calculate order
/// entrypoint. Used to update the store before the handle IO entrypoint runs.
/// @param namespace The `StateNamespace` to be passed to the store for calculate
/// IO state changes.
/// @param kvs KVs returned from calculate order entrypoint to pass to the store
/// before calling handle IO entrypoint.
struct OrderIOCalculation {
    uint256 outputMax;
    //solhint-disable-next-line var-name-mixedcase
    uint256 IORatio;
    uint256[][] context;
    IInterpreterStoreV1 store;
    StateNamespace namespace;
    uint256[] kvs;
}

/// @title OrderBook
/// @notice An orderbook that deploys _strategies_ represented as interpreter
/// expressions rather than individual orders. The order book contract itself
/// behaves similarly to an ERC4626 vault but with much more fine grained control
/// over how tokens are allocated and moved internally by their owners, and
/// without any concept of "shares". Token owners MAY deposit and withdraw their
/// tokens under arbitrary vault IDs on a per-token basis, then define orders
/// that specify how tokens move between vaults according to an expression. The
/// expression returns a maximum amount and a token input/output ratio from the
/// perpective of the order. When two expressions intersect, as in their ratios
/// are the inverse of each other, then tokens can move between vaults.
///
/// For example, consider order A with input TKNA and output TKNB with a constant
/// ratio of 100:1. This order in isolation has no ability to move tokens. If
/// an order B appears with input TKNB and output TKNA and a ratio of 1:100 then
/// this is a perfect match with order A. In this case 100 TKNA will move from
/// order B to order A and 1 TKNB will move from order A to order B.
///
/// IO ratios are always specified as input:output and are 18 decimal fixed point
/// values. The maximum amount that can be moved in the current clearance is also
/// set by the order expression as an 18 decimal fixed point value.
///
/// Typically orders will not clear when their match is exactly 1:1 as the
/// clearer needs to pay gas to process the match. Each order will get exactly
/// the ratio it calculates when it does clear so if there is _overlap_ in the
/// ratios then the clearer keeps the difference. In our above example, consider
/// order B asking a ratio of 1:110 instead of 1:100. In this case 100 TKNA will
/// move from order B to order A and 10 TKNA will move to the clearer's vault and
/// 1 TKNB will move from order A to order B. In the case of fixed prices this is
/// not very interesting as order B could more simply take order A directly for
/// cheaper rather than involving a third party. Indeed, Orderbook supports a
/// direct "take orders" method that works similar to a "market buy". In the case
/// of dynamic expression based ratios, it allows both order A and order B to
/// clear non-interactively according to their strategy, trading off active
/// management, dealing with front-running, MEV, etc. for zero-gas and
/// exact-ratio clearance.
///
/// Orderbook is `IERC3156FlashLender` compliant with a 0 fee flash loan
/// implementation to allow external liquidity from other onchain DEXes to match
/// against orderbook expressions. All deposited tokens across all vaults are
/// available for flashloan, the flashloan MAY BE REPAID BY CALLING TAKE ORDER
/// such that Orderbook's liability to its vaults is decreased by an incoming
/// trade from the flashloan borrower. See `ZeroExOrderBookFlashBorrower` for
/// an example of how this works in practise.
///
/// Orderbook supports many to many input/output token relationship, for example
/// some order can specify an array of stables it would be willing to accept in
/// return for some ETH. This removes the need for a combinatorial explosion of
/// order strategies between like assets but introduces the issue of token
/// decimal handling. End users understand that "one" USDT is roughly equal to
/// "one" DAI, but onchain this is incorrect by _12 orders of magnitude_. This
/// is because "one" DAI is `1e18` tokens and "one" USDT is `1e6` tokens. The
/// orderbook is allowing orders to deploy expressions that define _economic
/// equivalence_ but this doesn't map 1:1 with numeric equivalence in a many to
/// many setup behind token decimal convensions. The solution is to require that
/// end users who place orders provide the decimals of each token they include
/// in their valid IO lists, and to calculate all amounts and ratios in their
/// expressions _as though they were 18 decimal fixed point values_. Orderbook
/// will then automatically rescale the expression values before applying the
/// final vault movements. If an order provides the "wrong" decimal values for
/// some token then it will simply calculate its own ratios and amounts
/// incorrectly which will either lead to no matching orders or a very bad trade
/// for the order owner. There is no way that misrepresenting decimals can attack
/// some other order by a counterparty. Orderbook DOES NOT read decimals from
/// tokens onchain because A. this would be gas for an external call to a cold
/// token contract and B. the ERC20 standard specifically states NOT to read
/// decimals from the interface onchain.
///
/// When two orders clear there are NO TOKEN MOVEMENTS, only internal vault
/// balances are updated from the input and output vaults. Typically this results
/// in less gas per clear than calling external token transfers and also avoids
/// issues with reentrancy, allowances, external balances etc. This also means
/// that REBASING TOKENS AND TOKENS WITH DYNAMIC BALANCE ARE NOT SUPPORTED.
/// Orderbook ONLY WORKS IF TOKEN BALANCES ARE 1:1 WITH ADDITION/SUBTRACTION PER
/// VAULT MOVEMENT.
///
/// When an order clears it is NOT removed. Orders remain active until the owner
/// deactivates them. This is gas efficient as order owners MAY deposit more
/// tokens in a vault with an order against it many times and the order strategy
/// will continue to be clearable according to its expression. As vault IDs are
/// `uint256` values there are effectively infinite possible vaults for any token
/// so there is no limit to how many active orders any address can have at one
/// time. This also allows orders to be daisy chained arbitrarily where output
/// vaults for some order are the input vaults for some other order.
///
/// Expression storage is namespaced by order owner, so gets and sets are unique
/// to each onchain address. Order owners MUST TAKE CARE not to override their
/// storage sets globally across all their orders, which they can do most simply
/// by hashing the order hash into their get/set keys inside the expression. This
/// gives maximum flexibility for shared state across orders without allowing
/// order owners to attack and overwrite values stored by orders placed by their
/// counterparty.
contract OrderBook is
    IOrderBookV1,
    ReentrancyGuard,
    Multicall,
    OrderBookFlashLender,
    IInterpreterCallerV1
{
    using LibInterpreterState for bytes;
    using LibStackPointer for StackPointer;
    using LibStackPointer for uint256[];
    using LibUint256Array for uint256[];
    using SafeERC20 for IERC20;
    using Math for uint256;
    using FixedPointMath for uint256;
    using LibOrder for Order;
    using LibInterpreterState for InterpreterState;
    using LibUint256Array for uint256;

    /// Some tokens have been deposited to a vault.
    /// @param sender `msg.sender` depositing tokens. Delegated deposits are NOT
    /// supported.
    /// @param config All config sent to the `deposit` call.
    event Deposit(address sender, DepositConfig config);

    /// Some tokens have been withdrawn from a vault.
    /// @param sender `msg.sender` withdrawing tokens. Delegated withdrawals are
    /// NOT supported.
    /// @param config All config sent to the `withdraw` call.
    /// @param amount The amount of tokens withdrawn, can be less than the
    /// config amount if the vault does not have the funds available to cover
    /// the config amount. For example an active order might move tokens before
    /// the withdraw completes.
    event Withdraw(address sender, WithdrawConfig config, uint256 amount);

    /// An order has been added to the orderbook. The order is permanently and
    /// always active according to its expression until/unless it is removed.
    /// @param sender `msg.sender` adding the order and is owner of the order.
    /// @param order The newly added order. MUST be handed back as-is when
    /// clearing orders and contains derived information in addition to the order
    /// config that was provided by the order owner.
    /// @param orderHash The hash of the order as it is recorded onchain. Only
    /// the hash is stored in Orderbook storage to avoid paying gas to store the
    /// entire order.
    event AddOrder(address sender, Order order, uint256 orderHash);

    /// An order has been removed from the orderbook. This effectively
    /// deactivates it. Orders can be added again after removal.
    /// @param sender `msg.sender` removing the order and is owner of the order.
    /// @param order The removed order.
    /// @param orderHash The hash of the removed order.
    event RemoveOrder(address sender, Order order, uint256 orderHash);

    /// Some order has been taken by `msg.sender`. This is the same as them
    /// placing inverse orders then immediately clearing them all, but costs less
    /// gas and is more convenient and reliable. Analogous to a market buy
    /// against the specified orders. Each order that is matched within a the
    /// `takeOrders` loop emits its own individual event.
    /// @param sender `msg.sender` taking the orders.
    /// @param takeOrder All config defining the orders to attempt to take.
    /// @param input The input amount from the perspective of sender.
    /// @param output The output amount from the perspective of sender.
    event TakeOrder(
        address sender,
        TakeOrderConfig takeOrder,
        uint256 input,
        uint256 output
    );

    /// Emitted when attempting to match an order that either never existed or
    /// was removed. An event rather than an error so that we allow attempting
    /// many orders in a loop and NOT rollback on "best effort" basis to clear.
    /// @param sender `msg.sender` clearing the order that wasn't found.
    /// @param owner Owner of the order that was not found.
    /// @param orderHash Hash of the order that was not found.
    event OrderNotFound(address sender, address owner, uint256 orderHash);

    /// Emitted when an order evaluates to a zero amount. An event rather than an
    /// error so that we allow attempting many orders in a loop and NOT rollback
    /// on a "best effort" basis to clear.
    /// @param sender `msg.sender` clearing the order that had a 0 amount.
    /// @param owner Owner of the order that evaluated to a 0 amount.
    /// @param orderHash Hash of the order that evaluated to a 0 amount.
    event OrderZeroAmount(address sender, address owner, uint256 orderHash);

    /// Emitted when an order evaluates to a ratio exceeding the counterparty's
    /// maximum limit. An error rather than an error so that we allow attempting
    /// many orders in a loop and NOT rollback on a "best effort" basis to clear.
    /// @param sender `msg.sender` clearing the order that had an excess ratio.
    /// @param owner Owner of the order that had an excess ratio.
    /// @param orderHash Hash of the order that had an excess ratio.
    event OrderExceedsMaxRatio(
        address sender,
        address owner,
        uint256 orderHash
    );

    /// Emitted before two orders clear. Covers both orders and includes all the
    /// state before anything is calculated.
    /// @param sender `msg.sender` clearing both orders.
    /// @param a One of the orders.
    /// @param b The other order.
    /// @param clearConfig Additional config required to process the clearance.
    event Clear(address sender, Order a, Order b, ClearConfig clearConfig);

    /// Emitted after two orders clear. Includes all final state changes in the
    /// vault balances, including the clearer's vaults.
    /// @param sender `msg.sender` clearing the order.
    /// @param clearStateChange The final vault state changes from the clearance.
    event AfterClear(address sender, ClearStateChange clearStateChange);

    /// All hashes of all active orders. There's nothing interesting in the value
    /// it's just nonzero if the order is live. The key is the hash of the order.
    /// Removing an order sets the value back to zero so it is identical to the
    /// order never existing and gives a gas refund on removal.
    /// The order hash includes its owner so there's no need to build a multi
    /// level mapping, each order hash MUST uniquely identify the order globally.
    /// order hash => order is live
    mapping(uint256 => uint256) internal orders;

    /// @inheritdoc IOrderBookV1
    mapping(address => mapping(address => mapping(uint256 => uint256)))
        public vaultBalance;

    /// Initializes the orderbook upon construction for compatibility with
    /// Open Zeppelin upgradeable contracts. Orderbook itself does NOT support
    /// factory deployments as each order is a unique expression deployment
    /// rather than needing to wrap up expressions with proxies.
    constructor() initializer {
        __ReentrancyGuard_init();
        __Multicall_init();
    }

    /// `msg.sender` deposits tokens according to config. The config specifies
    /// the vault to deposit tokens under. Delegated depositing is NOT supported.
    /// Depositing DOES NOT mint shares (unlike ERC4626) so the overall vaulted
    /// experience is much simpler as there is always a 1:1 relationship between
    /// deposited assets and vault balances globally and individually. This
    /// mitigates rounding/dust issues, speculative behaviour on derived assets,
    /// possible regulatory issues re: whether a vault share is a security, code
    /// bloat on the vault, complex mint/deposit/withdraw/redeem 4-way logic,
    /// the need for preview functions, etc. etc.
    /// At the same time, allowing vault IDs to be specified by the depositor
    /// allows much more granular and direct control over token movements within
    /// Orderbook than either ERC4626 vault shares or mere contract-level ERC20
    /// allowances can facilitate.
    /// @param config_ All config for the deposit.
    function deposit(DepositConfig calldata config_) external nonReentrant {
        // It is safest with vault deposits to move tokens in to the Orderbook
        // before updating internal vault balances although we have a reentrancy
        // guard in place anyway.
        emit Deposit(msg.sender, config_);
        IERC20(config_.token).safeTransferFrom(
            msg.sender,
            address(this),
            config_.amount
        );
        vaultBalance[msg.sender][config_.token][config_.vaultId] += config_
            .amount;
    }

    /// Allows the sender to withdraw any tokens from their own vaults. If the
    /// withrawer has an active flash loan debt denominated in the same token
    /// being withdrawn then Orderbook will merely reduce the debt and NOT send
    /// the amount of tokens repaid to the flashloan debt.
    /// @param config_ All config required to withdraw. Notably if the amount
    /// is less than the current vault balance then the vault will be cleared
    /// to 0 rather than the withdraw transaction reverting.
    function withdraw(WithdrawConfig calldata config_) external nonReentrant {
        uint256 vaultBalance_ = vaultBalance[msg.sender][config_.token][
            config_.vaultId
        ];
        uint256 withdrawAmount_ = config_.amount.min(vaultBalance_);
        // The overflow check here is redundant with .min above, so technically
        // this is overly conservative but we REALLY don't want withdrawals to
        // exceed vault balances.
        vaultBalance[msg.sender][config_.token][config_.vaultId] =
            vaultBalance_ -
            withdrawAmount_;
        emit Withdraw(msg.sender, config_, withdrawAmount_);
        _decreaseFlashDebtThenSendToken(
            config_.token,
            msg.sender,
            withdrawAmount_
        );
    }

    /// Given an order config, deploys the expression and builds the full Order
    /// for the config, then records it as an active order. Delegated adding an
    /// order is NOT supported. The `msg.sender` that adds an order is ALWAYS
    /// the owner and all resulting vault movements are their own.
    /// @param config_ All config required to build an `Order`.
    function addOrder(OrderConfig calldata config_) external nonReentrant {
        address expression_ = IExpressionDeployerV1(config_.expressionDeployer)
            .deployExpression(
                config_.interpreterStateConfig,
                LibUint256Array.arrayFrom(
                    CALCULATE_ORDER_MIN_OUTPUTS,
                    HANDLE_IO_MIN_OUTPUTS
                )
            );
        Order memory order_ = Order(
            msg.sender,
            config_.interpreter,
            LibEncodedDispatch.encode(
                expression_,
                CALCULATE_ORDER_ENTRYPOINT,
                CALCULATE_ORDER_MAX_OUTPUTS
            ),
            config_
                .interpreterStateConfig
                .sources[SourceIndex.unwrap(HANDLE_IO_ENTRYPOINT)]
                .length > 0
                ? LibEncodedDispatch.encode(
                    expression_,
                    HANDLE_IO_ENTRYPOINT,
                    HANDLE_IO_MAX_OUTPUTS
                )
                : EncodedDispatch.wrap(0),
            config_.validInputs,
            config_.validOutputs,
            config_.data
        );
        uint256 orderHash_ = order_.hash();
        orders[orderHash_] = LIVE_ORDER;
        emit AddOrder(msg.sender, order_, orderHash_);
    }

    /// Order owner can remove their own orders. Delegated order removal is NOT
    /// supported and will revert. Removing an order multiple times or removing
    /// an order that never existed are valid, the event will be emitted and the
    /// transaction will complete with that order hash definitely, redundantly
    /// not live.
    /// @param order_ The `Order` data exactly as it was added.
    function removeOrder(Order calldata order_) external nonReentrant {
        if (msg.sender != order_.owner) {
            revert NotOrderOwner(msg.sender, order_.owner);
        }
        uint256 orderHash_ = order_.hash();
        delete (orders[orderHash_]);
        emit RemoveOrder(msg.sender, order_, orderHash_);
    }

    /// Main entrypoint into an order calculates the amount and IO ratio. Both
    /// are always treated as 18 decimal fixed point values and then rescaled
    /// according to the order's definition of each token's actual fixed point
    /// decimals.
    /// @param order_ The order to evaluate.
    /// @param inputIOIndex_ The index of the input token being calculated for.
    /// @param outputIOIndex_ The index of the output token being calculated for.
    /// @param counterparty_ The counterparty of the order as it is currently
    /// being cleared against.
    function _calculateOrderIO(
        Order memory order_,
        uint256 inputIOIndex_,
        uint256 outputIOIndex_,
        address counterparty_
    ) internal view virtual returns (OrderIOCalculation memory) {
        unchecked {
            uint256 orderHash_ = order_.hash();
            uint256[][] memory context_ = new uint256[][](CONTEXT_COLUMNS);

            {
                context_[CONTEXT_CALLING_CONTEXT_COLUMN] = LibUint256Array
                    .arrayFrom(
                        orderHash_,
                        uint256(uint160(order_.owner)),
                        uint256(uint160(counterparty_))
                    );

                context_[CONTEXT_VAULT_INPUTS_COLUMN] = LibUint256Array
                    .arrayFrom(
                        uint256(
                            uint160(order_.validInputs[inputIOIndex_].token)
                        ),
                        order_.validInputs[inputIOIndex_].decimals,
                        order_.validInputs[inputIOIndex_].vaultId,
                        vaultBalance[order_.owner][
                            order_.validInputs[inputIOIndex_].token
                        ][order_.validInputs[inputIOIndex_].vaultId],
                        // Don't know the balance diff yet!
                        0
                    );

                context_[CONTEXT_VAULT_OUTPUTS_COLUMN] = LibUint256Array
                    .arrayFrom(
                        uint256(
                            uint160(order_.validOutputs[outputIOIndex_].token)
                        ),
                        order_.validOutputs[outputIOIndex_].decimals,
                        order_.validOutputs[outputIOIndex_].vaultId,
                        vaultBalance[order_.owner][
                            order_.validOutputs[outputIOIndex_].token
                        ][order_.validOutputs[outputIOIndex_].vaultId],
                        // Don't know the balance diff yet!
                        0
                    );
            }

            // The state changes produced here are handled in _recordVaultIO so
            // that local storage writes happen before writes on the interpreter.
            StateNamespace namespace_ = StateNamespace.wrap(
                uint(uint160(order_.owner))
            );
            (
                uint256[] memory stack_,
                IInterpreterStoreV1 store_,
                uint256[] memory kvs_
            ) = IInterpreterV1(order_.interpreter).eval(
                    namespace_,
                    order_.dispatch,
                    context_
                );

            uint256 orderOutputMax_ = stack_[stack_.length - 2];
            uint256 orderIORatio_ = stack_[stack_.length - 1];

            // Rescale order output max from 18 FP to whatever decimals the
            // output token is using. Outputs are rounded down to favour the
            // order.
            orderOutputMax_ = orderOutputMax_.scaleN(
                order_.validOutputs[outputIOIndex_].decimals,
                Math.Rounding.Down
            );
            // Rescale the ratio from 18 FP according to the difference in
            // decimals between input and output. Inputs are rounded up to favour
            // the order.
            orderIORatio_ = orderIORatio_.scaleRatio(
                order_.validOutputs[outputIOIndex_].decimals,
                order_.validInputs[inputIOIndex_].decimals,
                Math.Rounding.Up
            );

            // The order owner can't send more than the smaller of their vault
            // balance or their per-order limit.
            orderOutputMax_ = orderOutputMax_.min(
                vaultBalance[order_.owner][
                    order_.validOutputs[outputIOIndex_].token
                ][order_.validOutputs[outputIOIndex_].vaultId]
            );

            // Populate the context with the output max rescaled and vault capped
            // and the rescaled ratio.
            context_[CONTEXT_CALCULATIONS_COLUMN] = LibUint256Array.arrayFrom(
                orderOutputMax_,
                orderIORatio_
            );

            return
                OrderIOCalculation(
                    orderOutputMax_,
                    orderIORatio_,
                    context_,
                    store_,
                    namespace_,
                    kvs_
                );
        }
    }

    /// Given an order, final input and output amounts and the IO calculation
    /// verbatim from `_calculateOrderIO`, dispatch the handle IO entrypoint if
    /// it exists and update the order owner's vault balances.
    /// @param order_ The order that is being cleared.
    /// @param input_ The exact token input amount to move into the owner's
    /// vault.
    /// @param output_ The exact token output amount to move out of the owner's
    /// vault.
    /// @param orderIOCalculation_ The verbatim order IO calculation returned by
    /// `_calculateOrderIO`.
    function _recordVaultIO(
        Order memory order_,
        uint256 input_,
        uint256 output_,
        OrderIOCalculation memory orderIOCalculation_
    ) internal virtual {
        orderIOCalculation_.context[CONTEXT_VAULT_INPUTS_COLUMN][
            CONTEXT_VAULT_IO_BALANCE_DIFF
        ] = input_;
        orderIOCalculation_.context[CONTEXT_VAULT_OUTPUTS_COLUMN][
            CONTEXT_VAULT_IO_BALANCE_DIFF
        ] = output_;

        if (input_ > 0) {
            // IMPORTANT! THIS MATH MUST BE CHECKED TO AVOID OVERFLOW.
            vaultBalance[order_.owner][
                address(
                    uint160(
                        orderIOCalculation_.context[
                            CONTEXT_VAULT_INPUTS_COLUMN
                        ][CONTEXT_VAULT_IO_TOKEN]
                    )
                )
            ][
                orderIOCalculation_.context[CONTEXT_VAULT_INPUTS_COLUMN][
                    CONTEXT_VAULT_IO_VAULT_ID
                ]
            ] += input_;
        }
        if (output_ > 0) {
            // IMPORTANT! THIS MATH MUST BE CHECKED TO AVOID UNDERFLOW.
            vaultBalance[order_.owner][
                address(
                    uint160(
                        orderIOCalculation_.context[
                            CONTEXT_VAULT_OUTPUTS_COLUMN
                        ][CONTEXT_VAULT_IO_TOKEN]
                    )
                )
            ][
                orderIOCalculation_.context[CONTEXT_VAULT_OUTPUTS_COLUMN][
                    CONTEXT_VAULT_IO_VAULT_ID
                ]
            ] -= output_;
        }

        // Emit the context only once in its fully populated form rather than two
        // nearly identical emissions of a partial and full context.
        emit Context(msg.sender, orderIOCalculation_.context);

        // Apply state changes to the interpreter store after the vault balances
        // are updated, but before we call handle IO. We want handle IO to see
        // a consistent view on sets from calculate IO.
        if (orderIOCalculation_.kvs.length > 0) {
            orderIOCalculation_.store.set(
                orderIOCalculation_.namespace,
                orderIOCalculation_.kvs
            );
        }

        // Only dispatch handle IO entrypoint if it is defined, otherwise it is
        // a waste of gas to hit the interpreter a second time.
        if (EncodedDispatch.unwrap(order_.handleIODispatch) > 0) {
            // The handle IO eval is run under the same namespace as the
            // calculate order entrypoint.
            (
                ,
                IInterpreterStoreV1 handleIOStore_,
                uint256[] memory handleIOKVs_
            ) = IInterpreterV1(order_.interpreter).eval(
                    orderIOCalculation_.namespace,
                    order_.handleIODispatch,
                    orderIOCalculation_.context
                );
            // Apply state changes to the interpreter store from the handle IO
            // entrypoint.
            if (handleIOKVs_.length > 0) {
                handleIOStore_.set(orderIOCalculation_.namespace, handleIOKVs_);
            }
        }
    }

    function _clearStateChange(
        OrderIOCalculation memory aOrderIOCalculation_,
        OrderIOCalculation memory bOrderIOCalculation_
    ) internal pure returns (ClearStateChange memory) {
        ClearStateChange memory clearStateChange_;
        {
            clearStateChange_.aOutput = aOrderIOCalculation_.outputMax.min(
                bOrderIOCalculation_.outputMax.fixedPointMul(
                    bOrderIOCalculation_.IORatio,
                    Math.Rounding.Down
                )
            );
            clearStateChange_.bOutput = bOrderIOCalculation_.outputMax.min(
                aOrderIOCalculation_.outputMax.fixedPointMul(
                    aOrderIOCalculation_.IORatio,
                    Math.Rounding.Down
                )
            );

            clearStateChange_.aInput = clearStateChange_.aOutput.fixedPointMul(
                aOrderIOCalculation_.IORatio,
                Math.Rounding.Up
            );
            clearStateChange_.bInput = clearStateChange_.bOutput.fixedPointMul(
                bOrderIOCalculation_.IORatio,
                Math.Rounding.Up
            );
        }
        return clearStateChange_;
    }

    function takeOrders(
        TakeOrdersConfig calldata takeOrders_
    )
        external
        nonReentrant
        returns (uint256 totalInput_, uint256 totalOutput_)
    {
        uint256 i_ = 0;
        TakeOrderConfig memory takeOrder_;
        Order memory order_;
        uint256 remainingInput_ = takeOrders_.maximumInput;
        while (i_ < takeOrders_.orders.length && remainingInput_ > 0) {
            takeOrder_ = takeOrders_.orders[i_];
            order_ = takeOrder_.order;
            uint256 orderHash_ = order_.hash();
            if (orders[orderHash_] == 0) {
                emit OrderNotFound(msg.sender, order_.owner, orderHash_);
            } else {
                if (
                    order_.validInputs[takeOrder_.inputIOIndex].token !=
                    takeOrders_.output
                ) {
                    revert TokenMismatch(
                        order_.validInputs[takeOrder_.inputIOIndex].token,
                        takeOrders_.output
                    );
                }
                if (
                    order_.validOutputs[takeOrder_.outputIOIndex].token !=
                    takeOrders_.input
                ) {
                    revert TokenMismatch(
                        order_.validOutputs[takeOrder_.outputIOIndex].token,
                        takeOrders_.input
                    );
                }

                OrderIOCalculation
                    memory orderIOCalculation_ = _calculateOrderIO(
                        order_,
                        takeOrder_.inputIOIndex,
                        takeOrder_.outputIOIndex,
                        msg.sender
                    );

                // Skip orders that are too expensive rather than revert as we have
                // no way of knowing if a specific order becomes too expensive
                // between submitting to mempool and execution, but other orders may
                // be valid so we want to take advantage of those if possible.
                if (orderIOCalculation_.IORatio > takeOrders_.maximumIORatio) {
                    emit OrderExceedsMaxRatio(
                        msg.sender,
                        order_.owner,
                        orderHash_
                    );
                } else if (orderIOCalculation_.outputMax == 0) {
                    emit OrderZeroAmount(msg.sender, order_.owner, orderHash_);
                } else {
                    uint256 input_ = remainingInput_.min(
                        orderIOCalculation_.outputMax
                    );
                    // Favour the order for rounding.
                    uint256 output_ = input_.fixedPointMul(
                        orderIOCalculation_.IORatio,
                        Math.Rounding.Up
                    );

                    remainingInput_ -= input_;
                    totalOutput_ += output_;

                    _recordVaultIO(
                        order_,
                        output_,
                        input_,
                        orderIOCalculation_
                    );
                    emit TakeOrder(msg.sender, takeOrder_, input_, output_);
                }
            }

            unchecked {
                i_++;
            }
        }
        totalInput_ = takeOrders_.maximumInput - remainingInput_;

        if (totalInput_ < takeOrders_.minimumInput) {
            revert MinimumInput(takeOrders_.minimumInput, totalInput_);
        }

        IERC20(takeOrders_.output).safeTransferFrom(
            msg.sender,
            address(this),
            totalOutput_
        );
        _decreaseFlashDebtThenSendToken(
            takeOrders_.input,
            msg.sender,
            totalInput_
        );
    }

    function clear(
        Order memory a_,
        Order memory b_,
        ClearConfig calldata clearConfig_
    ) external nonReentrant {
        {
            if (a_.owner == b_.owner) {
                revert SameOwner(a_.owner);
            }
            if (
                a_.validOutputs[clearConfig_.aOutputIOIndex].token !=
                b_.validInputs[clearConfig_.bInputIOIndex].token
            ) {
                revert TokenMismatch(
                    a_.validOutputs[clearConfig_.aOutputIOIndex].token,
                    b_.validInputs[clearConfig_.bInputIOIndex].token
                );
            }

            if (
                b_.validOutputs[clearConfig_.bOutputIOIndex].token !=
                a_.validInputs[clearConfig_.aInputIOIndex].token
            ) {
                revert TokenMismatch(
                    b_.validOutputs[clearConfig_.bOutputIOIndex].token,
                    a_.validInputs[clearConfig_.aInputIOIndex].token
                );
            }

            // If either order is dead the clear is a no-op other than emitting
            // `OrderNotFound`. Returning rather than erroring makes it easier to
            // bulk clear using `Multicall`.
            if (orders[a_.hash()] == DEAD_ORDER) {
                emit OrderNotFound(msg.sender, a_.owner, a_.hash());
                return;
            }
            if (orders[b_.hash()] == DEAD_ORDER) {
                emit OrderNotFound(msg.sender, b_.owner, b_.hash());
                return;
            }

            // Emit the Clear event before `eval`.
            emit Clear(msg.sender, a_, b_, clearConfig_);
        }
        OrderIOCalculation memory aOrderIOCalculation_ = _calculateOrderIO(
            a_,
            clearConfig_.aInputIOIndex,
            clearConfig_.aOutputIOIndex,
            b_.owner
        );
        OrderIOCalculation memory bOrderIOCalculation_ = _calculateOrderIO(
            b_,
            clearConfig_.bInputIOIndex,
            clearConfig_.bOutputIOIndex,
            a_.owner
        );
        ClearStateChange memory clearStateChange_ = _clearStateChange(
            aOrderIOCalculation_,
            bOrderIOCalculation_
        );

        _recordVaultIO(
            a_,
            clearStateChange_.aInput,
            clearStateChange_.aOutput,
            aOrderIOCalculation_
        );
        _recordVaultIO(
            b_,
            clearStateChange_.bInput,
            clearStateChange_.bOutput,
            bOrderIOCalculation_
        );

        {
            // At least one of these will overflow due to negative bounties if
            // there is a spread between the orders.
            uint256 aBounty_ = clearStateChange_.aOutput -
                clearStateChange_.bInput;
            uint256 bBounty_ = clearStateChange_.bOutput -
                clearStateChange_.aInput;
            if (aBounty_ > 0) {
                vaultBalance[msg.sender][
                    a_.validOutputs[clearConfig_.aOutputIOIndex].token
                ][clearConfig_.aBountyVaultId] += aBounty_;
            }
            if (bBounty_ > 0) {
                vaultBalance[msg.sender][
                    b_.validOutputs[clearConfig_.bOutputIOIndex].token
                ][clearConfig_.bBountyVaultId] += bBounty_;
            }
        }

        emit AfterClear(msg.sender, clearStateChange_);
    }
}
