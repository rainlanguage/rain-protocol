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
    uint256 vaultId;
}

struct OrderConfig {
    address expressionDeployer;
    address interpreter;
    StateConfig interpreterStateConfig;
    IO[] validInputs;
    IO[] validOutputs;
}

struct Order {
    address owner;
    address interpreter;
    EncodedDispatch dispatch;
    EncodedDispatch handleIODispatch;
    IO[] validInputs;
    IO[] validOutputs;
}

struct TakeOrdersConfig {
    address output;
    address input;
    uint256 minimumInput;
    uint256 maximumInput;
    uint256 maximumIORatio;
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
        uint id
    ) external view returns (uint balance);

    function deposit(DepositConfig calldata config) external;

    function withdraw(WithdrawConfig calldata config) external;

    function addOrder(OrderConfig calldata config) external;

    function removeOrder(Order calldata order) external;

    function takeOrders(
        TakeOrdersConfig calldata takeOrders
    )
        external
        returns (uint256 totalInput, uint256 totalOutput);

    function clear(
        Order memory a,
        Order memory b,
        ClearConfig calldata clearConfig
    ) external;
}
