// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../../../orderbook/IOrderBookV1.sol";
import "../../../run/LibStackTop.sol";
import "../../../run/LibInterpreterState.sol";
import "../../../deploy/LibIntegrityState.sol";

/// @title OpIOrderBookV1ClearedCounterparty
/// @notice Opcode for IOrderBookV1 `clearedCounterparty`.
library OpIOrderBookV1ClearedCounterparty {
    using LibStackTop for StackTop;
    using LibIntegrityState for IntegrityState;

    function f(
        uint256 orderbook_,
        uint orderHash_,
        uint counterparty_
    ) internal view returns (uint256) {
        return
            uint256(
                uint160(
                    IOrderBookV1(address(uint160(orderbook_)))
                        .clearedCounterparty(
                            orderHash_,
                            address(uint160(counterparty_))
                        )
                )
            );
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
