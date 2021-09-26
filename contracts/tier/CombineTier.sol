// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

import { RainCompiler } from "../compiler/RainCompiler.sol";
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

    function applyOpcode(
        bytes memory context_,
        uint256[32] memory stack_,
        uint8 stackIndex_,
        uint8 opcode_,
        uint8 operand_
    )
        internal
        override
        view
        returns (uint256[32] memory, uint8)
    {
        if (opcode_ == OPCODE_ACCOUNT) {
            (address account_) = abi.decode(context_, (address));
            stack_[stackIndex_] = uint256(account_);
            stackIndex_++;
        }
        if (opcode_ == OPCODE_REPORT) {
            stackIndex_ -= 2;
            stack_[stackIndex_] = ITier(stack_[stackIndex_ + 1])
                .report(address(stack_[stackIndex_]));
            stackIndex_++;
        }
        if (opcode_ == OPCODE_AND_NEW) {
            stackIndex_ -= operand_;
            uint256[] memory args_ = new uint256[](operand_ - 1);
            for (uint256 a_ = 0; a_ < args_.length; a_++) {
                args_[a_] = stack_[stackIndex_ + a_];
            }

            stack_[stackIndex_] = TierwiseCombine.andNew(
                args_,
                stack_[stackIndex_ + operand_ - 1]
            );
        }
        if (opcode_ == OPCODE_AND_OLD) {
            stackIndex_ -= operand_;
            uint256[] memory args_ = new uint256[](operand_ - 1);
            for (uint256 a_ = 0; a_ < args_.length; a_++) {
                args_[a_] = stack_[stackIndex_ + a_];
            }

            stack_[stackIndex_] = TierwiseCombine.andOld(
                args_,
                stack_[stackIndex_ + operand_ - 1]
            );
        }
        if (opcode_ == OPCODE_AND_LEFT) {
            stackIndex_ -= operand_;
            uint256[] memory args_ = new uint256[](operand_ - 1);
            for (uint256 a_ = 0; a_ < args_.length; a_++) {
                args_[a_] = stack_[stackIndex_ + a_];
            }

            stack_[stackIndex_] = TierwiseCombine.andLeft(
                args_,
                stack_[stackIndex_ + operand_ - 1]
            );
        }
        if (opcode_ == OPCODE_OR_NEW) {
            stackIndex_ -= operand_;
            uint256[] memory args_ = new uint256[](operand_ - 1);
            for (uint256 a_ = 0; a_ < args_.length; a_++) {
                args_[a_] = stack_[stackIndex_ + a_];
            }

            stack_[stackIndex_] = TierwiseCombine.orNew(
                args_,
                stack_[stackIndex_ + operand_ - 1]
            );
        }
        if (opcode_ == OPCODE_OR_OLD) {
            stackIndex_ -= operand_;
            uint256[] memory args_ = new uint256[](operand_ - 1);
            for (uint256 a_ = 0; a_ < args_.length; a_++) {
                args_[a_] = stack_[stackIndex_ + a_];
            }

            stack_[stackIndex_] = TierwiseCombine.orOld(
                args_,
                stack_[stackIndex_ + operand_ - 1]
            );
        }
        if (opcode_ == OPCODE_OR_LEFT) {
            stackIndex_ -= operand_;
            uint256[] memory args_ = new uint256[](operand_ - 1);
            for (uint256 a_ = 0; a_ < args_.length; a_++) {
                args_[a_] = stack_[stackIndex_ + a_];
            }

            stack_[stackIndex_] = TierwiseCombine.orLeft(
                args_,
                stack_[stackIndex_ + operand_ - 1]
            );
        }

        return (stack_, stackIndex_);
    }

    function report(address account_)
        external
        view
        override
        virtual
        returns (uint256)
    {
        uint256[32] memory stack_;
        uint8 stackIndex_;
        (stack_, stackIndex_) = eval(
            abi.encode(account_),
            stack_,
            stackIndex_,
            source(),
            vals()
        );
        return stack_[stackIndex_ - 1];
    }
}