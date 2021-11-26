// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "../RainVM.sol";
import "../../emissions/libraries/TierwiseEmissions.sol";

enum Ops {
    claimReport
}

abstract contract EmissionsOps {
    uint8 public immutable emissionsOpsStart;
    uint8 public immutable opcodeEmissionsReport;
    uint8 public constant EMISSIONS_OPS_LENGTH = 1;

    constructor(uint8 start_) {
        emissionsOpsStart = start_;
        opcodeEmissionsReport = start_ + uint8(Ops.claimReport);
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
        if (op_.code == opcodeEmissionsReport) {
            stack_.index -= op_.val + 1;
            uint256[] memory args_ = new uint256[](op_.val);
            for (uint256 a_ = 0; a_ < args_.length; a_++) {
                args_[a_] = stack_.vals[stack_.index + a_ + 1];
            }

            uint256 blockNumber_ = stack_.vals[stack_.index];

            // TODO: Calculate number of blocks to be claimed at each tier
            stack_.vals[stack_.index] = TierwiseEmissions.claimReport(
                args_,
                blockNumber_
            );
        }
        else {
            // Unhandled opcode!
            assert(false);
        }

        stack_.index++;
        return stack_;
    }
}