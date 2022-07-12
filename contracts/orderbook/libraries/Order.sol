// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../OrderBook.sol";
import "./Vault.sol";
import "../../vm/RainVM.sol";
import "../../vm/VMStateBuilder.sol";

type OrderHash is uint256;
type OrderLiveness is uint256;

struct OrderConfig {
    address inputToken;
    VaultId inputVaultId;
    address outputToken;
    VaultId outputVaultId;
    StateConfig vmStateConfig;
}

struct Order {
    address owner;
    address inputToken;
    VaultId inputVaultId;
    address outputToken;
    VaultId outputVaultId;
    uint256 tracking;
    bytes vmState;
}

uint256 constant ENTRYPOINT = 0;
uint256 constant MIN_FINAL_STACK_INDEX = 2;

OrderLiveness constant ORDER_DEAD = OrderLiveness.wrap(0);
OrderLiveness constant ORDER_LIVE = OrderLiveness.wrap(1);

library LibOrder {
    function deriveTracking(bytes[] memory sources_)
        internal
        pure
        returns (uint256 tracking_)
    {
        unchecked {
            uint localOpClearedOrder_ = LOCAL_OP_CLEARED_ORDER;
            uint localOpClearedCounterparty_ = LOCAL_OP_CLEARED_COUNTERPARTY;
            uint trackingMaskClearedOrder_ = TRACKING_MASK_CLEARED_ORDER;
            uint trackingMaskClearedCounterparty_ = TRACKING_MASK_CLEARED_COUNTERPARTY;
            uint trackingMaskAll_ = TRACKING_MASK_ALL;
            for (uint256 i_ = 0; i_ < sources_.length; i_++) {
                bytes memory source_ = sources_[i_];
                assembly {
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
        Bounds memory bounds_;
        bounds_.entrypoint = ENTRYPOINT;
        bounds_.minFinalStackIndex = MIN_FINAL_STACK_INDEX;
        Bounds[] memory boundss_ = new Bounds[](1);
        boundss_[0] = bounds_;
        return
            Order(
                msg.sender,
                config_.inputToken,
                config_.inputVaultId,
                config_.outputToken,
                config_.outputVaultId,
                deriveTracking(config_.vmStateConfig.sources),
                VMStateBuilder(vmStateBuilder_).buildState(
                    vm_,
                    config_.vmStateConfig,
                    boundss_
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
