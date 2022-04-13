// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "./Vault.sol";
import "../../vm/RainVM.sol";

type OrderHash is uint256;
type OrderLiveness is uint256;

struct Order {
    address owner;
    address inputToken;
    VaultId inputVaultId;
    address outputToken;
    VaultId outputVaultId;
    uint256 tracking;
    State vmState;
}

OrderLiveness constant ORDER_DEAD = OrderLiveness.wrap(0);
OrderLiveness constant ORDER_LIVE = OrderLiveness.wrap(1);

library OrderLogic {
    function isLive(OrderLiveness liveness_) internal pure returns (bool) {
        return
            OrderLiveness.unwrap(liveness_) == OrderLiveness.unwrap(ORDER_LIVE);
    }

    function isDead(OrderLiveness liveness_) internal pure returns (bool) {
        return
            OrderLiveness.unwrap(liveness_) == OrderLiveness.unwrap(ORDER_DEAD);
    }

    function hash(Order calldata order_) internal pure returns (OrderHash) {
        return OrderHash.wrap(uint256(keccak256(abi.encode(order_))));
    }
}
