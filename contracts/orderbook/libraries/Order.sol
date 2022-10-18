// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../OrderBook.sol";
import "../../vm/runtime/RainVM.sol";
import "../../vm/integrity/RainVMIntegrity.sol";
import "../../array/LibUint256Array.sol";

type OrderHash is uint256;
type OrderLiveness is uint256;

struct OrderConfig {
    IO[] validInputs;
    IO[] validOutputs;
    StateConfig vmStateConfig;
}

struct IO {
    address token;
    uint256 vaultId;
}

struct Order {
    address owner;
    IO[] validInputs;
    IO[] validOutputs;
    bytes vmState;
}

uint256 constant MIN_FINAL_STACK_INDEX = 2;

OrderLiveness constant ORDER_DEAD = OrderLiveness.wrap(0);
OrderLiveness constant ORDER_LIVE = OrderLiveness.wrap(1);

library LibOrder {
    using LibUint256Array for uint256;

    function fromOrderConfig(
        IRainVMIntegrity vmIntegrity_,
        function(IRainVMIntegrity, StateConfig memory, uint256[] memory)
            internal
            returns (bytes memory) buildStateBytes_,
        OrderConfig memory config_
    ) internal returns (Order memory) {
        bytes memory stateBytes_ = buildStateBytes_(
            vmIntegrity_,
            config_.vmStateConfig,
            MIN_FINAL_STACK_INDEX.arrayFrom()
        );
        return
            Order(
                msg.sender,
                config_.validInputs,
                config_.validOutputs,
                stateBytes_
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

    function hash(Order memory order_) internal pure returns (OrderHash) {
        return OrderHash.wrap(uint256(keccak256(abi.encode(order_))));
    }
}
