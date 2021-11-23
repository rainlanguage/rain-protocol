// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "../Sale.sol";
import "../../vm/RainVM.sol";

enum Ops {
    saleStartBlock,
    lastBuyBlock,
    lastBuyPrice,
    lastUnitsSold,
    totalRaised,
    remainingUnits
}

abstract contract SaleOps {
    using Math for uint256;

    uint8 public immutable saleOpsStart;
    uint8 public immutable opcodeSaleStartBlock;
    uint8 public immutable opcodeLastUnitsSold;
    uint8 public immutable opcodeRemainingUnits;
    uint8 public immutable opcodeLastBuyBlock;
    uint8 public immutable opcodeLastBuyPrice;
    uint8 public immutable opcodeTotalRaised;
    uint8 public constant SALE_OPS_LENGTH = 6;

    constructor(uint8 start_) {
        saleOpsStart = start_;
        opcodeSaleStartBlock = start_ + uint8(Ops.saleStartBlock);
        opcodeLastUnitsSold = start_ + uint8(Ops.lastUnitsSold);
        opcodeRemainingUnits = start_ + uint8(Ops.remainingUnits);
        opcodeLastBuyBlock = start_ + uint8(Ops.lastBuyBlock);
        opcodeLastBuyPrice = start_ + uint8(Ops.lastBuyPrice);
        opcodeTotalRaised = start_ + uint8(Ops.totalRaised);
    }

    function applyOp(
        bytes memory contextBytes_,
        Stack memory stack_,
        Op memory op_
    )
    internal
    virtual
    view
    returns (Stack memory) {
        if (saleOpsStart <= op_.code
            && op_.code < saleOpsStart + SALE_OPS_LENGTH
        ) {
            Context memory context_ = abi.decode(contextBytes_, (Context));
            if (op_.code == opcodeSaleStartBlock) {
                stack_.vals[stack_.index] = context_.saleStartBlock;
            }
            else if (op_.code == opcodeLastUnitsSold) {
                stack_.vals[stack_.index] = context_.state.lastUnitsSold;
            }
            else if (op_.code == opcodeRemainingUnits) {
                stack_.vals[stack_.index] = context_.state.remainingUnits;
            }
            else if (op_.code == opcodeLastBuyBlock) {
                stack_.vals[stack_.index] = context_.state.lastBuyBlock;
            }
            else if (op_.code == opcodeLastBuyPrice) {
                stack_.vals[stack_.index] = context_.state.lastBuyPrice;
            }
            else if (op_.code == opcodeTotalRaised) {
                stack_.vals[stack_.index] = context_.state.totalRaised;
            }
            else {
                // Unhandled opcode!
                assert(false);
            }
            stack_.index++;
        }
        return stack_;
    }

}