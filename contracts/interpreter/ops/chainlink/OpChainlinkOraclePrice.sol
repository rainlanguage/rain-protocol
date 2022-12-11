// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import {LibChainlink} from "../../../chainlink/LibChainlink.sol";
import "../../run/LibStackTop.sol";
import "../../run/LibInterpreterState.sol";
import "../../deploy/LibIntegrityState.sol";

/// @title OpChainlinkOraclePrice
/// @notice Opcode for chainlink oracle prices.
library OpChainlinkOraclePrice {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function f(
        uint256 feed_,
        uint256 staleAfter_
    ) internal view returns (uint256) {
        return LibChainlink.price(address(uint160(feed_)), staleAfter_);
    }

    function integrity(
        IntegrityState memory integrityState_,
        Operand,
        StackTop stackTop_
    ) internal pure returns (StackTop) {
        return integrityState_.applyFn(stackTop_, f);
    }

    function run(
        InterpreterState memory,
        Operand,
        StackTop stackTop_
    ) internal view returns (StackTop) {
        return stackTop_.applyFn(f);
    }
}
