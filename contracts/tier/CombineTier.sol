// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

import { RainCompiler, Stack, Op } from "../compiler/RainCompiler.sol";
import { TierwiseCombine } from "./libraries/TierwiseCombine.sol";
import { ReadOnlyTier, ITier } from "./ReadOnlyTier.sol";

contract CombineTier is ReadOnlyTier, RainCompiler {
    uint8 public constant OPCODE_ACCOUNT = 0 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_REPORT = 1 + OPCODE_RESERVED_MAX;

    uint8 public constant OPCODE_AND_OLD = 2 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_AND_NEW = 3 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_AND_LEFT = 4 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_OR_OLD = 5 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_OR_NEW = 6 + OPCODE_RESERVED_MAX;
    uint8 public constant OPCODE_OR_LEFT = 7 + OPCODE_RESERVED_MAX;

    constructor(bytes memory source_)
        public
        // solhint-disable-next-line no-empty-blocks
        RainCompiler(source_) { }

    function applyOp(
        bytes memory context_,
        Stack memory stack_,
        Op memory op_
    )
        internal
        override
        view
        returns (Stack memory)
    {
        if (op_.code == OPCODE_ACCOUNT) {
            (address account_) = abi.decode(context_, (address));
            stack_.vals[stack_.index] = uint256(account_);
            stack_.index++;
        }
        else if (op_.code == OPCODE_REPORT) {
            stack_.index -= 2;
            stack_.vals[stack_.index] = ITier(stack_.vals[stack_.index + 1])
                .report(address(stack_.vals[stack_.index]));
            stack_.index++;
        }
        else if (OPCODE_AND_NEW <= op_.code && op_.code <= OPCODE_OR_LEFT) {
            stack_.index -= op_.val;
            uint256[] memory args_ = new uint256[](op_.val - 1);
            for (uint256 a_ = 0; a_ < args_.length; a_++) {
                args_[a_] = stack_.vals[stack_.index + a_];
            }

            uint256 blockNumber_ = stack_.vals[stack_.index + op_.val - 1];

            if (op_.code == OPCODE_AND_NEW) {
                stack_.vals[stack_.index] = TierwiseCombine.andNew(
                    args_,
                    blockNumber_
                );
            }
            else if (op_.code == OPCODE_AND_OLD) {
                stack_.vals[stack_.index] = TierwiseCombine.andOld(
                    args_,
                    blockNumber_
                );
            }
            else if (op_.code == OPCODE_AND_LEFT) {
                stack_.vals[stack_.index] = TierwiseCombine.andLeft(
                    args_,
                    blockNumber_
                );
            }
            else if (op_.code == OPCODE_OR_NEW) {
                stack_.vals[stack_.index] = TierwiseCombine.orNew(
                    args_,
                    blockNumber_
                );
            }
            else if (op_.code == OPCODE_OR_OLD) {
                stack_.vals[stack_.index] = TierwiseCombine.orOld(
                    args_,
                    blockNumber_
                );
            }
            else if (op_.code == OPCODE_OR_LEFT) {
                stack_.vals[stack_.index] = TierwiseCombine.orLeft(
                    args_,
                    blockNumber_
                );
            }
        }

        return stack_;
    }

    function report(address account_)
        external
        view
        override
        virtual
        returns (uint256)
    {
        Stack memory stack_;
        stack_ = eval(
            abi.encode(account_),
            stack_,
            compiledSource()
        );
        return stack_.vals[stack_.index - 1];
    }
}