// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "../Sale.sol";
import "../../vm/RainVM.sol";

enum Ops {
    saleStartBlock,
    lastBuyBlock,
    lastBuyPrice,
    lastUnitsSold,
    totalReserveRaised,
    totalUnitsSold
}

abstract contract SaleOps is Sale {
    using Math for uint256;

    uint8 public immutable saleOpsStart;
    uint8 public immutable opcodeSaleStartBlock;
    uint8 public immutable opcodeLastUnitsSold;
    uint8 public immutable opcodeTotalUnitsSold;
    uint8 public immutable opcodeLastBuyBlock;
    uint8 public immutable opcodeLastBuyPrice;
    uint8 public immutable opcodeTotalReserveRaised;
    uint8 public constant SALE_OPS_LENGTH = 6;

    constructor(uint8 start_) {
        saleOpsStart = start_;
        opcodeSaleStartBlock = start_ + uint8(Ops.saleStartBlock);
        opcodeLastUnitsSold = start_ + uint8(Ops.lastUnitsSold);
        opcodeTotalUnitsSold = start_ + uint8(Ops.totalUnitsSold);
        opcodeLastBuyBlock = start_ + uint8(Ops.lastBuyBlock);
        opcodeLastBuyPrice = start_ + uint8(Ops.lastBuyPrice);
        opcodeTotalReserveRaised = start_ + uint8(Ops.totalReserveRaised);
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
        if (saleOpsStart <= op_.code
            && op_.code < saleOpsStart + SALE_OPS_LENGTH
        ) {
            if (op_.code == opcodeSaleStartBlock) {
                stack_.vals[stack_.index] = saleStartBlock;
            }
            else if (op_.code == opcodeLastUnitsSold) {
                stack_.vals[stack_.index] = lastUnitsSold;
            }
            else if (op_.code == opcodeTotalUnitsSold) {
                stack_.vals[stack_.index] = totalUnitsSold;
            }
            else if (op_.code == opcodeLastBuyBlock) {
                stack_.vals[stack_.index] = lastBuyBlock;
            }
            else if (op_.code == opcodeLastBuyPrice) {
                stack_.vals[stack_.index] = lastBuyPrice;
            }
            else if (op_.code == opcodeTotalReserveRaised) {
                stack_.vals[stack_.index] = totalReserveRaised;
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