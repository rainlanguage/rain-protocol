// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../extern/IInterpreterExternV1.sol";
import "../ops/chainlink/OpChainlinkOraclePrice.sol";
import "../run/LibStackPointer.sol";
import "../../array/LibUint256Array.sol";

error BadInputs(uint256 expected, uint256 actual);

contract RainterpreterExtern is IInterpreterExternV1 {
    using LibStackPointer for uint256[];
    using LibStackPointer for StackPointer;
    using LibUint256Array for uint256;

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
