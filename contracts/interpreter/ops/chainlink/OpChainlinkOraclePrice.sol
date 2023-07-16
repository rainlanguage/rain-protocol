// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import {LibChainlink} from "rain.chainlink/lib/LibChainlink.sol";
import "rain.interpreter/lib/op/LibOp.sol";
import "rain.solmem/lib/LibStackPointer.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "rain.interpreter/lib/integrity/LibIntegrityCheck.sol";
import "rain.interpreter/lib/op/chainlink/LibOpChainlinkOraclePrice.sol";

/// @title OpChainlinkOraclePrice
/// @notice Opcode for chainlink oracle prices.
library OpChainlinkOraclePrice {
    using LibOp for Pointer;
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function integrity(
        IntegrityCheckState memory integrityCheckState,
        Operand,
        Pointer stackTop
    ) internal pure returns (Pointer) {
        return integrityCheckState.applyFn(stackTop, LibOpChainlinkOraclePrice.f);
    }

    function run(
        InterpreterState memory,
        Operand operand,
        Pointer stackTop
    ) internal view returns (Pointer) {
        return stackTop.applyFn(LibOpChainlinkOraclePrice.f, operand);
    }
}
