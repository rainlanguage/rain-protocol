// SPDX-License-Identifier: CAL
pragma solidity ^0.8.18;

import {LibChainlink} from "../../../chainlink/LibChainlink.sol";
import "rain.interpreter/lib/op/LibOp.sol";
import "sol.lib.memory/LibStackPointer.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "../../deploy/LibIntegrityCheck.sol";

/// @title OpChainlinkOraclePrice
/// @notice Opcode for chainlink oracle prices.
library OpChainlinkOraclePrice {
    using LibOp for Pointer;
    using LibStackPointer for Pointer;
    using LibIntegrityCheck for IntegrityCheckState;

    function f(
        uint256 feed_,
        uint256 staleAfter_
    ) internal view returns (uint256) {
        return LibChainlink.price(address(uint160(feed_)), staleAfter_);
    }

    function integrity(
        IntegrityCheckState memory integrityCheckState_,
        Operand,
        Pointer stackTop_
    ) internal pure returns (Pointer) {
        return integrityCheckState_.applyFn(stackTop_, f);
    }

    function run(
        InterpreterState memory,
        Operand,
        Pointer stackTop_
    ) internal view returns (Pointer) {
        return stackTop_.applyFn(f);
    }
}
