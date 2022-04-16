// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import {RainVM, State, Dispatch, DispatchTable} from "../vm/RainVM.sol";
import {VMState, StateConfig, SourceAnalysis} from "../vm/VMState.sol";
// solhint-disable-next-line max-line-length
import {AllStandardOps, ALL_STANDARD_OPS_START, ALL_STANDARD_OPS_LENGTH} from "../vm/ops/AllStandardOps.sol";
import {TierwiseCombine} from "./libraries/TierwiseCombine.sol";
import {ReadOnlyTier, ITier} from "./ReadOnlyTier.sol";

uint256 constant SOURCE_INDEX = 0;

/// @title CombineTier
/// @notice Implements `ReadOnlyTier` over RainVM. Allows combining the reports
/// from any other `ITier` contracts referenced in the `ImmutableSource` set at
/// construction.
/// The value at the top of the stack after executing the rain script will be
/// used as the return of `report`.
contract CombineTier is ReadOnlyTier, RainVM, VMState, Initializable {
    address private vmStatePointer;

    /// @param config_ The StateConfig will be deployed as a pointer under
    /// `vmStatePointer`.
    function initialize(StateConfig calldata config_) external initializer {
        SourceAnalysis memory sourceAnalysis_ = _newSourceAnalysis();
        analyzeSources(sourceAnalysis_, config_.sources, SOURCE_INDEX);
        vmStatePointer = _snapshot(_newState(config_, sourceAnalysis_));
    }

    /// @inheritdoc RainVM
    function stackIndexDiff(uint256 opcode_, uint256 operand_)
        public
        view
        virtual
        override
        returns (int256)
    {
        return AllStandardOps.stackIndexDiff(opcode_, operand_);
    }

    function fnPtrs() public pure override returns (bytes memory) {
        return AllStandardOps.dispatchTableBytes();
    }

    /// @inheritdoc ITier
    function report(address account_)
        external
        view
        virtual
        override
        returns (uint256)
    {
        State memory state_ = _restore(vmStatePointer);
        bytes memory context_ = new bytes(0x20);
        uint accountContext_ = uint(uint160(account_));
        assembly {
            mstore(add(context_, 0x20), accountContext_)
        }
        eval(context_, state_, SOURCE_INDEX);
        return state_.stack[state_.stackIndex - 1];
    }
}
