// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../run/IInterpreterV1.sol";
import "../extern/IInterpreterExternV1.sol";
import "../ops/chainlink/OpChainlinkOraclePrice.sol";
import "../run/LibStackPointer.sol";
import "../../array/LibUint256Array.sol";
import {ERC165Upgradeable as ERC165} from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";

/// Thrown when the inputs don't match the expected inputs.
error BadInputs(uint256 expected, uint256 actual);

/// EXPERIMENTAL implementation of `IInterpreterExternV1`.
/// Currently only implements the Chainlink oracle price opcode as a starting
/// point to test and flesh out externs generally.
/// Hopefully one day the idea of there being only a single extern contract seems
/// quaint.
contract RainterpreterExtern is IInterpreterExternV1, ERC165 {
    using LibStackPointer for uint256[];
    using LibStackPointer for StackPointer;
    using LibUint256Array for uint256;

    // @inheritdoc ERC165
    function supportsInterface(
        bytes4 interfaceId_
    ) public view virtual override returns (bool) {
        return
            interfaceId_ == type(IInterpreterExternV1).interfaceId ||
            super.supportsInterface(interfaceId_);
    }

    /// @inheritdoc IInterpreterExternV1
    function extern(
        ExternDispatch dispatch_,
        uint256[] memory inputs_
    ) external view returns (uint256[] memory) {
        if (inputs_.length != 2) {
            revert BadInputs(2, inputs_.length);
        }
        StackPointer stackTop_ = inputs_.asStackPointerAfter();
        uint256 opcode_ = (ExternDispatch.unwrap(dispatch_) >> 16) & MASK_16BIT;

        // Operand operand_ = Operand.wrap(ExternDispatch.unwrap(dispatch_) & MASK_16BIT);
        uint256[] memory outputs_;
        // This is an O(n) approach to dispatch so it doesn't scale. This should
        // be replaced with an O(1) dispatch.
        if (opcode_ == 0) {
            outputs_ = stackTop_
                .applyFn(OpChainlinkOraclePrice.f)
                .peek()
                .arrayFrom();
        } else {
            LibInterpreterState.debugStack(inputs_.asStackPointer(), stackTop_);
            outputs_ = inputs_;
        }
        return outputs_;
    }
}
