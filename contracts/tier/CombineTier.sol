// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

import { RainCompiler } from "../compiler/RainCompiler.sol";
import { TierwiseCombine } from "./libraries/TierwiseCombine.sol";
import { ReadOnlyTier, ITier } from "./ReadOnlyTier.sol";

contract CombineTier is ReadOnlyTier, RainCompiler {
    uint8 constant OPCODE_AND_OLD = 3;
    uint8 constant OPCODE_AND_NEW = 4;
    uint8 constant OPCODE_AND_LEFT = 5;
    uint8 constant OPCODE_OR_OLD = 6;
    uint8 constant OPCODE_OR_NEW = 7;
    uint8 constant OPCODE_OR_LEFT = 8;

    constructor(bytes memory source_)
        public
        RainCompiler(source_) { }

    function runCompiledAddressToInt(address tierAddress_, bytes memory data_)
        internal
        override
        view
        returns (uint256)
    {
        address account_ = abi.decode(data_, (address));
        return ITier(tierAddress_).report(account_);
    }

    function runCompiledDispatch(
        uint8 opcode_,
        uint256[] memory args_,
        bytes memory
    )
        internal
        override
        view
        returns (uint256)
    {
        if (opcode_ == OPCODE_AND_NEW) {
            return TierwiseCombine.andNew(
                args_,
                block.number
            );
        }
        if (opcode_ == OPCODE_AND_OLD) {
            return TierwiseCombine.andOld(
                args_,
                block.number
            );
        }
        if (opcode_ == OPCODE_AND_LEFT) {
            return TierwiseCombine.andLeft(
                args_,
                block.number
            );
        }
        if (opcode_ == OPCODE_OR_NEW) {
            return TierwiseCombine.orNew(
                args_,
                block.number
            );
        }
        if (opcode_ == OPCODE_OR_OLD) {
            return TierwiseCombine.orOld(
                args_,
                block.number
            );
        }
        if (opcode_ == OPCODE_OR_LEFT) {
            return TierwiseCombine.orLeft(
                args_,
                block.number
            );
        }
        // Some opcode we don't know about.
        assert(false);
    }

    function report(address account_)
        external
        view
        override
        virtual
        returns (uint256)
    {
        return runCompiled(
            abi.encode(account_),
            new bytes(0)
        );
    }
}