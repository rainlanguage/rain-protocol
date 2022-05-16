// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

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
    uint256 tracking;
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
                config_.tracking,
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
