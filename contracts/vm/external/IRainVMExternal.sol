// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "../runtime/RainVM.sol";

interface IRainVMExternal {
    function dispatch(uint256 opcode_, uint256[] memory inputs_)
        external
        view
        returns (uint256[] memory outputs_);
}
