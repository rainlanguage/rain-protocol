// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {Cooldown} from "../cooldown/Cooldown.sol";

import "../vm/RainVM.sol";
import {IERC20Ops} from "../vm/ops/IERC20Ops.sol";
import {IERC721Ops} from "../vm/ops/IERC721Ops.sol";
import {IERC1155Ops} from "../vm/ops/IERC1155Ops.sol";
import {VMState, StateConfig} from "../vm/libraries/VMState.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract TokenOpsTest is RainVM, VMState {
    uint256 private immutable ierc20OpsStart;
    uint256 private immutable ierc721OpsStart;
    uint256 private immutable ierc1155OpsStart;
    uint256 private immutable localOpsStart;
    address private immutable vmStatePointer;

    constructor(StateConfig memory config_) {
        ierc20OpsStart = RainVM.OPS_LENGTH;
        ierc721OpsStart = ierc20OpsStart + IERC20Ops.OPS_LENGTH;
        ierc1155OpsStart = ierc721OpsStart + IERC721Ops.OPS_LENGTH;
        localOpsStart = ierc1155OpsStart + IERC1155Ops.OPS_LENGTH;

        vmStatePointer = _snapshot(_newState(RainVM(this), config_));
    }

    /// Wraps `runState` and returns top of stack.
    /// @return top of `runState` stack.
    function run() external view returns (uint256) {
        State memory state_ = runState();
        return state_.stack[state_.stackIndex - 1];
    }

    /// Wraps `runState` and returns top `length_` values on the stack.
    /// @return top `length_` values on `runState` stack.
    function runLength(uint256 length_)
        external
        view
        returns (uint256[] memory)
    {
        State memory state_ = runState();

        uint256[] memory stackArray = new uint256[](length_);

        for (uint256 i = 0; i < length_; ++i) {
            stackArray[i] = state_.stack[state_.stackIndex - length_ + i];
        }

        return stackArray;
    }

    /// Runs `eval` and returns full state.
    /// @return `State` after running own immutable source.
    function runState() public view returns (State memory) {
        State memory state_ = _restore(vmStatePointer);
        eval("", state_, 0);
        return state_;
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
            if (opcode_ < ierc721OpsStart) {
                return
                    IERC20Ops.stackIndexDiff(
                        opcode_ - ierc20OpsStart,
                        operand_
                    );
            } else if (opcode_ < ierc1155OpsStart) {
                return
                    IERC721Ops.stackIndexDiff(
                        opcode_ - ierc721OpsStart,
                        operand_
                    );
            } else {
                return
                    IERC721Ops.stackIndexDiff(
                        opcode_ - ierc1155OpsStart,
                        operand_
                    );
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
            if (opcode_ < ierc721OpsStart) {
                return
                    IERC20Ops.applyOp(
                        context_,
                        stackTopLocation_,
                        opcode_ - ierc20OpsStart,
                        operand_
                    );
            } else if (opcode_ < ierc1155OpsStart) {
                return
                    IERC721Ops.applyOp(
                        context_,
                        stackTopLocation_,
                        opcode_ - ierc721OpsStart,
                        operand_
                    );
            } else {
                return
                    IERC1155Ops.applyOp(
                        context_,
                        stackTopLocation_,
                        opcode_ - ierc1155OpsStart,
                        operand_
                    );
            }
        }
    }
}
