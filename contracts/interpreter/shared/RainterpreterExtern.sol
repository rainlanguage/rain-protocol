// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../extern/IInterpreterExternV1.sol";
import "../ops/chainlink/OpChainlinkOraclePrice.sol";
import "../run/LibStackPointer.sol";
import "../../array/LibUint256Array.sol";

/// Thrown when the inputs don't match the expected inputs.
error BadInputs(uint256 expected, uint256 actual);

/// EXPERIMENTAL implementation of `IInterpreterExternV1`.
/// Currently only implements the Chainlink oracle price opcode as a starting
/// point to test and flesh out externs generally.
contract RainterpreterExtern is IInterpreterExternV1 {
    using LibStackPointer for uint256[];
    using LibStackPointer for StackPointer;
    using LibUint256Array for uint256;

    /// @inheritdoc IInterpreterExternV1
    function extern(
        ExternDispatch,
        uint256[] memory inputs_
    ) external view returns (uint256[] memory outputs) {
        if (inputs_.length != 2) {
            revert BadInputs(2, inputs_.length);
        }
        return
            inputs_
                .asStackPointerAfter()
                .applyFn(OpChainlinkOraclePrice.f)
                .peek()
                .arrayFrom();
    }
}
