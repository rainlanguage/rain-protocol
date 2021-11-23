// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "../RainVM.sol";

enum Ops {
    blockNumber
}

abstract contract BlockOps {
    uint8 public immutable blockOpsStart;
    uint8 public immutable opcodeBlockNumber;
    uint8 public constant BLOCK_OPS_LENGTH = 1;

    constructor(uint8 start_) {
        blockOpsStart = start_;
        opcodeBlockNumber = start_ + uint8(Ops.blockNumber);
    }

    function applyOp(
        bytes memory,
        Stack memory stack_,
        Op memory op_
    )
    internal
    virtual
    view
    returns (Stack memory) {
        if (op_.code == opcodeBlockNumber) {
            stack_.vals[stack_.index] = block.number;
            stack_.index++;
        }
        return stack_;
    }

}