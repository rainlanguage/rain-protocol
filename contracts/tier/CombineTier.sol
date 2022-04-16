// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import {RainVM, State, Dispatch, DispatchTable} from "../vm/RainVM.sol";
import {VMState, StateConfig, SourceAnalysis} from "../vm/libraries/VMState.sol";
// solhint-disable-next-line max-line-length
import {AllStandardOps, ALL_STANDARD_OPS_START, ALL_STANDARD_OPS_LENGTH} from "../vm/ops/AllStandardOps.sol";
import {TierwiseCombine} from "./libraries/TierwiseCombine.sol";
import {ReadOnlyTier, ITier} from "./ReadOnlyTier.sol";
import "../sstore2/SSTORE2.sol";

uint256 constant SOURCE_INDEX = 0;

/// @title CombineTier
/// @notice Implements `ReadOnlyTier` over RainVM. Allows combining the reports
/// from any other `ITier` contracts referenced in the `ImmutableSource` set at
/// construction.
/// The value at the top of the stack after executing the rain script will be
/// used as the return of `report`.
contract CombineTier is ReadOnlyTier, RainVM, VMState, Initializable {
    /// @dev local opcode to put tier report account on the stack.
    uint256 private constant OPCODE_ACCOUNT = 0;
    /// @dev local opcodes length.
    uint256 internal constant LOCAL_OPS_LENGTH = 1;

    address private vmStatePointer;
    address private fnPtrsPointer;

    /// @param config_ The StateConfig will be deployed as a pointer under
    /// `vmStatePointer`.
    function initialize(StateConfig calldata config_) external initializer {
        SourceAnalysis memory sourceAnalysis_ = _newSourceAnalysis();
        analyzeSources(sourceAnalysis_, config_.sources, SOURCE_INDEX);
        vmStatePointer = _snapshot(_newState(config_, sourceAnalysis_));

        bytes memory fnPtrs_ = fnPtrs();
        fnPtrsPointer = SSTORE2.write(fnPtrs_);
    }

    /// @inheritdoc RainVM
    function stackIndexDiff(uint256 opcode_, uint256 operand_)
        public
        view
        virtual
        override
        returns (int256)
    {
        unchecked {
            if (opcode_ < ALL_STANDARD_OPS_LENGTH) {
                return AllStandardOps.stackIndexDiff(opcode_, operand_);
            } else {
                return 1;
            }
        }
    }

    function account(
        bytes memory context_,
        uint256,
        uint256 stackTopLocation_
    ) internal view returns (uint256) {
        assembly {
            mstore(stackTopLocation_, mload(add(context_, 0x20)))
            stackTopLocation_ := add(stackTopLocation_, 0x20)
        }
        return stackTopLocation_;
    }

    function fnPtrs() public view returns (bytes memory) {
        bytes memory dispatchTableBytes_ = new bytes(0x20);
        function(bytes memory, uint256, uint256)
            view
            returns (uint256) account_ = account;
        assembly {
            mstore(add(dispatchTableBytes_, 0x20), account_)
        }
        return
            bytes.concat(
                AllStandardOps.dispatchTableBytes(),
                dispatchTableBytes_
            );
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
        eval(
            Dispatch.fromBytes(SSTORE2.read(fnPtrsPointer)),
            abi.encode(account_),
            state_,
            SOURCE_INDEX
        );
        return state_.stack[state_.stackIndex - 1];
    }
}
