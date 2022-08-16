// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "../runtime/RainVM.sol";

interface IRainVMExternal {
    function dispatch(
        uint opcode_,
        uint[] calldata inputs_
    ) external view returns (uint256[] calldata outputs_);
}
