// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../OrderBook.sol";
import "../../vm/RainVM.sol";
import "../../vm/VMStateBuilder.sol";
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
    uint256 tracking;
    bytes vmState;
}

SourceIndex constant ENTRYPOINT = SourceIndex.wrap(0);
uint256 constant MIN_FINAL_STACK_INDEX = 2;

OrderLiveness constant ORDER_DEAD = OrderLiveness.wrap(0);
OrderLiveness constant ORDER_LIVE = OrderLiveness.wrap(1);

library LibOrder {
    using LibUint256Array for uint256;

    function deriveTracking(bytes[] memory sources_)
        internal
        pure
        returns (uint256 tracking_)
    {
        unchecked {
            uint256 localOpClearedOrder_ = LOCAL_OP_CLEARED_ORDER;
            uint256 localOpClearedCounterparty_ = LOCAL_OP_CLEARED_COUNTERPARTY;
            uint256 trackingMaskClearedOrder_ = TRACKING_MASK_CLEARED_ORDER;
            uint256 trackingMaskClearedCounterparty_ = TRACKING_MASK_CLEARED_COUNTERPARTY;
            uint256 trackingMaskAll_ = TRACKING_MASK_ALL;
            for (uint256 i_ = 0; i_ < sources_.length; i_++) {
                bytes memory source_ = sources_[i_];
                assembly ("memory-safe") {
                    let op_ := 0
                    for {
                        let cursor_ := add(source_, 1)
                        let end_ := add(cursor_, mload(source_))
                    } lt(cursor_, end_) {
                        cursor_ := add(cursor_, 2)
                    } {
                        op_ := byte(31, mload(cursor_))
                        if lt(op_, localOpClearedOrder_) {
                            continue
                        }
                        if eq(op_, localOpClearedOrder_) {
                            tracking_ := or(
                                tracking_,
                                trackingMaskClearedOrder_
                            )
                        }
                        if eq(op_, localOpClearedCounterparty_) {
                            tracking_ := or(
                                tracking_,
                                trackingMaskClearedCounterparty_
                            )
                        }
                        if eq(tracking_, trackingMaskAll_) {
                            // break the outer loop by setting i_
                            // to sources length.
                            i_ := mload(sources_)
                            // break the inner loop.
                            break
                        }
                    }
                }
            }
        }
    }

    function fromOrderConfig(
        address vmStateBuilder_,
        address vm_,
        OrderConfig memory config_
    ) internal returns (Order memory) {
        return
            Order(
                msg.sender,
                config_.validInputs,
                config_.validOutputs,
                deriveTracking(config_.vmStateConfig.sources),
                VMStateBuilder(vmStateBuilder_).buildStateBytes(
                    vm_,
                    config_.vmStateConfig,
                    MIN_FINAL_STACK_INDEX.arrayFrom()
                )
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
