// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {Cooldown} from "../../cooldown/Cooldown.sol";

import "../../vm/RainVM.sol";
import {ERC20Ops, ERC20_OPS_LENGTH} from "../../vm/ops/token/ERC20Ops.sol";
// solhint-disable-next-line max-line-length
import {ERC721Ops, ERC721_OPS_LENGTH} from "../../vm/ops/token/ERC721Ops.sol";
// solhint-disable-next-line max-line-length
import {ERC1155Ops, ERC1155_OPS_LENGTH} from "../../vm/ops/token/ERC1155Ops.sol";
import {VMState, StateConfig} from "../../vm/libraries/VMState.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract TokenOpsTest is RainVM, VMState {
    uint256 private immutable erc20OpsStart;
    uint256 private immutable erc721OpsStart;
    uint256 private immutable erc1155OpsStart;
    address private immutable vmStatePointer;

    constructor(StateConfig memory config_) {
        erc20OpsStart = RAIN_VM_OPS_LENGTH;
        erc721OpsStart = erc20OpsStart + ERC20_OPS_LENGTH;
        erc1155OpsStart = erc721OpsStart + ERC721_OPS_LENGTH;

        vmStatePointer = _snapshot(_newState(config_));
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
    function applyOp(
        bytes memory,
        State memory state_,
        uint256 opcode_,
        uint256 operand_
    ) internal view override {
        unchecked {
            if (opcode_ < erc721OpsStart) {
                ERC20Ops.applyOp(state_, opcode_ - erc20OpsStart, operand_);
            } else if (opcode_ < erc1155OpsStart) {
                ERC721Ops.applyOp(state_, opcode_ - erc721OpsStart, operand_);
            } else {
                ERC1155Ops.applyOp(state_, opcode_ - erc1155OpsStart, operand_);
            }
        }
    }
}
