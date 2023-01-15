// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../interpreter/deploy/IExpressionDeployerV1.sol";
import "../interpreter/run/IInterpreterV1.sol";

struct DepositConfig {
    address token;
    uint256 vaultId;
    uint256 amount;
}

struct WithdrawConfig {
    address token;
    uint256 vaultId;
    uint256 amount;
}

struct IO {
    address token;
    uint8 decimals;
    uint256 vaultId;
}

struct OrderConfig {
    address expressionDeployer;
    address interpreter;
    StateConfig interpreterStateConfig;
    IO[] validInputs;
    IO[] validOutputs;
    bytes data;
}

struct Order {
    address owner;
    address interpreter;
    EncodedDispatch dispatch;
    EncodedDispatch handleIODispatch;
    IO[] validInputs;
    IO[] validOutputs;
    bytes data;
}

struct TakeOrdersConfig {
    /// Output token from the perspective of the order taker.
    address output;
    /// Input token from the perspective of the order taker.
    address input;
    /// Minimum input from the perspective of the order taker.
    uint256 minimumInput;
    /// Maximum input from the perspective of the order taker.
    uint256 maximumInput;
    /// Maximum IO ratio as calculated by the order being taken. The input is
    /// from the perspective of the order so higher ratio means worse deal for
    /// the order taker.
    uint256 maximumIORatio;
    /// Ordered list of orders that will be taken until the limit is hit. Takers
    /// are expected to prioritise orders that appear to be offering better
    /// deals i.e. lower IO ratios. This prioritisation and sorting MUST happen
    /// offchain, e.g. via. some simulator.
    TakeOrderConfig[] orders;
}

struct TakeOrderConfig {
    Order order;
    uint256 inputIOIndex;
    uint256 outputIOIndex;
}

struct ClearConfig {
    uint256 aInputIOIndex;
    uint256 aOutputIOIndex;
    uint256 bInputIOIndex;
    uint256 bOutputIOIndex;
    uint256 aBountyVaultId;
    uint256 bBountyVaultId;
}

interface IOrderBookV1 {
    /// depositor => token => vault id => token amount.
    function vaultBalance(
        address owner,
        address token,
        uint256 id
    ) external view returns (uint256 balance);

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
    /// @param config All config for the deposit.
    function deposit(DepositConfig calldata config) external;

    /// Allows the sender to withdraw any tokens from their own vaults. If the
    /// withrawer has an active flash loan debt denominated in the same token
    /// being withdrawn then Orderbook will merely reduce the debt and NOT send
    /// the amount of tokens repaid to the flashloan debt.
    /// @param config All config required to withdraw. Notably if the amount
    /// is less than the current vault balance then the vault will be cleared
    /// to 0 rather than the withdraw transaction reverting.
    function withdraw(WithdrawConfig calldata config) external;

    /// Given an order config, deploys the expression and builds the full Order
    /// for the config, then records it as an active order. Delegated adding an
    /// order is NOT supported. The `msg.sender` that adds an order is ALWAYS
    /// the owner and all resulting vault movements are their own.
    /// @param config All config required to build an `Order`.
    function addOrder(OrderConfig calldata config) external;

    /// Order owner can remove their own orders. Delegated order removal is NOT
    /// supported and will revert. Removing an order multiple times or removing
    /// an order that never existed are valid, the event will be emitted and the
    /// transaction will complete with that order hash definitely, redundantly
    /// not live.
    /// @param order The `Order` data exactly as it was added.
    function removeOrder(Order calldata order) external;

    /// Allows `msg.sender` to attempt to fill a list of orders in sequence
    /// without needing to place their own order and clear them. This works like
    /// a market buy but against a specific set of orders. Every order will
    /// looped over and calculated individually then filled maximally until the
    /// request input is reached for the `msg.sender`. The `msg.sender` is
    /// responsible for selecting the best orders at the time according to their
    /// criteria and MAY specify a maximum IO ratio to guard against an order
    /// spiking the ratio beyond what the `msg.sender` expected and is
    /// comfortable with. As orders may be removed and calculate their ratios
    /// dynamically, all issues fulfilling an order other than misconfiguration
    /// by the `msg.sender` are no-ops and DO NOT revert the transaction. This
    /// allows the `msg.sender` to optimistically provide a list of orders that
    /// they aren't sure will completely fill at a good price, and fallback to
    /// more reliable orders further down their list. Misconfiguration such as
    /// token mismatches are errors that revert as this is known and static at
    /// all times to the `msg.sender` so MUST be provided correctly. `msg.sender`
    /// MAY specify a minimum input that MUST be reached across all orders in the
    /// list, otherwise the transaction will revert, this MAY be set to zero.
    ///
    /// Exactly like withdraw, if there is an active flash loan for `msg.sender`
    /// they will have their outstanding loan reduced by the final input amount
    /// preferentially before sending any tokens. Notably this allows arb bots
    /// implemented as flash loan borrowers to connect orders against external
    /// liquidity directly by paying back the loan with a `takeOrders` call and
    /// outputting the result of the external trade.
    ///
    /// Rounding errors always favour the order never the `msg.sender`.
    ///
    /// @param takeOrders The constraints and list of orders to take, orders are
    /// processed sequentially in order as provided, there is NO ATTEMPT onchain
    /// to predict/filter/sort these orders other than evaluating them as
    /// provided. Inputs and outputs are from the perspective of `msg.sender`
    /// except for values specified by the orders themselves which are the from
    /// the perspective of that order.
    /// @return totalInput Total tokens sent to `msg.sender`, taken from order
    /// vaults processed.
    /// @return totalOutput Total tokens taken from `msg.sender` and distributed
    /// between vaults.
    function takeOrders(
        TakeOrdersConfig calldata takeOrders
    ) external returns (uint256 totalInput, uint256 totalOutput);

    /// Allows `msg.sender` to match two live orders placed earlier by
    /// non-interactive parties and claim a bounty in the process. The clearer is
    /// free to select any two live orders on the order book for matching and as
    /// long as they have compatible tokens, ratios and amounts, the orders will
    /// clear. Clearing the orders DOES NOT remove them from the orderbook, they
    /// remain live until explicitly removed by their owner. Even if the input
    /// vault balances are completely emptied, the orders remain live until
    /// removed. This allows order owners to deploy a strategy over a long period
    /// of time and periodically top up the input vaults. Clearing two orders
    /// from the same owner is disallowed.
    ///
    /// Any mismatch in the ratios between the two orders will cause either more
    /// inputs than there are available outputs (transaction will revert) or less
    /// inputs than there are available outputs. In the latter case the excess
    /// outputs are given to the `msg.sender` of clear, to the vaults they
    /// specify in the clear config. This not only incentivises "automatic" clear
    /// calls for both a_ and b_, but incentivises _prioritising greater ratio
    /// differences_ with a larger bounty. The second point is important because
    /// it implicitly prioritises orders that are further from the current
    /// market price, thus putting constant increasing pressure on the entire
    /// system the further it drifts from the norm, no matter how esoteric the
    /// individual order expressions and sizings might be.
    ///
    /// All else equal there are several factors that would impact how reliably
    /// some order clears relative to the wider market, such as:
    ///
    /// - Bounties are effectively percentages of cleared amounts so larger
    ///   orders have larger bounties and cover gas costs more easily
    /// - High gas on the network means that orders are harder to clear
    ///   profitably so the negative spread of the ratios will need to be larger
    /// - Complex and stateful expressions cost more gas to evalulate so the
    ///   negative spread will need to be larger
    /// - Erratic behavior of the order owner could reduce the willingness of
    ///   third parties to interact if it could result in wasted gas due to
    ///   orders suddently being removed before clearance etc.
    /// - Dynamic and highly volatile words used in the expression could be
    ///   ignored or low priority by clearers who want to be sure that they can
    ///   accurately predict the ratios that they include in their clearance
    /// - Geopolitical issues such as sanctions and regulatory restrictions could
    ///   cause issues for certain owners and clearers
    ///
    /// @param a Some order to clear.
    /// @param b Another order to clear.
    /// @param clearConfig Additional configuration for the clearance such as
    /// how to handle the bounty payment for the `msg.sender`.
    function clear(
        Order memory a,
        Order memory b,
        ClearConfig calldata clearConfig
    ) external;
}
