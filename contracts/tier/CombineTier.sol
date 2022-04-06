// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import {RainVM, State} from "../vm/RainVM.sol";
import {VMState, StateConfig} from "../vm/libraries/VMState.sol";
// solhint-disable-next-line max-line-length
import {AllStandardOps, ALL_STANDARD_OPS_START, ALL_STANDARD_OPS_LENGTH} from "../vm/ops/AllStandardOps.sol";
import {TierwiseCombine} from "./libraries/TierwiseCombine.sol";
import {ReadOnlyTier, ITier} from "./ReadOnlyTier.sol";

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

    /// @dev local offset for combine tier ops.
    uint256 private immutable localOpsStart;

    address private vmStatePointer;

    constructor() {
        localOpsStart = ALL_STANDARD_OPS_START + ALL_STANDARD_OPS_LENGTH;
    }

    /// @param config_ The StateConfig will be deployed as a pointer under
    /// `vmStatePointer`.
    function initialize(StateConfig memory config_) external initializer {
        vmStatePointer = _snapshot(_newState(RainVM(this), config_));
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
            if (opcode_ < tierOpsStart) {
                return
                    BlockOps.stackIndexDiff(opcode_ - blockOpsStart, operand_);
            } else if (opcode_ < localOpsStart) {
                return TierOps.stackIndexDiff(opcode_ - tierOpsStart, operand_);
            } else {
                return 1;
            }
        }
    }

    /// @inheritdoc RainVM
    function applyOp(
        bytes memory context_,
        uint256 stackTopLocation_,
        uint256 opcode_,
        uint256 operand_
    ) internal view override returns (uint256) {
        unchecked {
            if (opcode_ < localOpsStart) {
                AllStandardOps.applyOp(
                    state_,
                    opcode_ - ALL_STANDARD_OPS_START,
                    operand_
                );
            } else {
                // There's only one opcode, which stacks the address to report.
                uint account_ = uint(uint160(address(abi.decode(context_, (address)))));
                assembly {
                    mstore(stackTopLocation_, account_)
                }
                return stackTopLocation_ + 0x20;
            }
        }
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
        eval(abi.encode(account_), state_, 0);
        return state_.stack[state_.stackIndex - 1];
    }
}
