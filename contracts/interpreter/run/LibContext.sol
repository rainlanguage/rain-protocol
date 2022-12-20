// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../../array/LibUint256Array.sol";

library LibContext {
    using LibUint256Array for uint256[];

    function base() internal view returns (uint256[] memory) {
        return
            LibUint256Array.arrayFrom(
                uint(uint160(msg.sender)),
                uint(uint160(address(this)))
            );
    }

    function base(
        uint256[] memory extend_
    ) internal view returns (uint256[] memory) {
        uint256[] memory base_ = LibContext.base();
        base_.extend(extend_);
        return base_;
    }
}
