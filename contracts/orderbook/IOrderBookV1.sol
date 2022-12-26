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

    function deposit(DepositConfig calldata config) external;

    function withdraw(WithdrawConfig calldata config) external;

    function addOrder(OrderConfig calldata config) external;

    function removeOrder(Order calldata order) external;

    function takeOrders(
        TakeOrdersConfig calldata takeOrders
    ) external returns (uint256 totalInput, uint256 totalOutput);

    function clear(
        Order memory a,
        Order memory b,
        ClearConfig calldata clearConfig
    ) external;
}
