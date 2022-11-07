// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../OrderBook.sol";
import "../../interpreter/run/RainInterpreter.sol";
import "../../interpreter/deploy/RainInterpreterIntegrity.sol";
import "../../array/LibUint256Array.sol";

type OrderLiveness is uint256;

struct OrderConfig {
    address expressionDeployer;
    address interpreter;
    StateConfig interpreterStateConfig;
    IO[] validInputs;
    IO[] validOutputs;
}

struct IO {
    address token;
    uint256 vaultId;
}

struct Order {
    address owner;
    address interpreter;
    address expression;
    IO[] validInputs;
    IO[] validOutputs;
}

SourceIndex constant ORDER_ENTRYPOINT = SourceIndex.wrap(0);
uint256 constant MIN_FINAL_STACK_INDEX = 2;

OrderLiveness constant ORDER_DEAD = OrderLiveness.wrap(0);
OrderLiveness constant ORDER_LIVE = OrderLiveness.wrap(1);

library LibOrder {
    using LibUint256Array for uint256;

    function fromOrderConfig(
        OrderConfig memory config_
    ) internal returns (Order memory) {
        (
            address expressionAddress,
        ) = IExpressionDeployerV1(config_.expressionDeployer).deployExpression(
                config_.interpreterStateConfig,
                MIN_FINAL_STACK_INDEX.arrayFrom()
            );
        return
            Order(
                msg.sender,
                config_.interpreter,
                expressionAddress,
                config_.validInputs,
                config_.validOutputs
            );
    }

    function isLive(OrderLiveness liveness_) internal pure returns (bool) {
        return
            OrderLiveness.unwrap(liveness_) == OrderLiveness.unwrap(ORDER_LIVE);
    }

    function isDead(OrderLiveness liveness_) internal pure returns (bool) {
        return
            OrderLiveness.unwrap(liveness_) == OrderLiveness.unwrap(ORDER_DEAD);
    }

    function hash(Order memory order_) internal pure returns (uint) {
        return uint256(keccak256(abi.encode(order_)));
    }
}
