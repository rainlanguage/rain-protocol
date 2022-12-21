// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../deploy/IExpressionDeployerV1.sol";
import "../deploy/StandardIntegrity.sol";
import "../ops/core/OpGet.sol";
import "../../sstore2/SSTORE2.sol";

bytes constant OPCODE_FUNCTION_POINTERS = hex"0c6d0c7b0cd10d230da10dcd0e660f300f650f83100b101a102810361044101a10521060106e107d108c109a10a81120112f113e114d115c116b11b411c611d41206121412221230123f124e125d126c127b128a129912a812b712c612d512e312f112ff130d131b1329133713461355136313da0bdb";
bytes32 constant OPCODE_FUNCTION_POINTERS_HASH = keccak256(
    OPCODE_FUNCTION_POINTERS
);
bytes32 constant INTERPRETER_BYTECODE_HASH = bytes32(
    0x9555776441bec42df8ec833bfa043727111e6e1327a4fd0c129ff6d449e7f682
);

contract RainterpreterExpressionDeployer is
    StandardIntegrity,
    IExpressionDeployerV1
{
    using LibInterpreterState for StateConfig;
    using LibStackTop for StackTop;

    event ValidInterpreter(address sender, address interpreter);
    event DeployExpression(
        address sender,
        StateConfig config,
        address expressionAddress,
        uint256 contextReads
    );

    /// THIS IS NOT A SECURITY CHECK. IT IS AN INTEGRITY CHECK TO PREVENT HONEST
    /// MISTAKES. IT CANNOT PREVENT EITHER A MALICIOUS INTERPRETER OR DEPLOYER
    /// FROM BEING EXECUTED.
    constructor(address interpreter_) {
        // Guard against serializing incorrect function pointers, which would
        // cause undefined runtime behaviour for corrupted opcodes.
        bytes memory functionPointers_ = IInterpreterV1(interpreter_)
            .functionPointers();
        if (keccak256(functionPointers_) != OPCODE_FUNCTION_POINTERS_HASH) {
            console.logBytes(functionPointers_);
            revert("BAD_POINTERS");
        }

        // Guard against an interpreter with unknown/untrusted bytecode that
        // could run arbitrary logic even if the function pointers are identical
        // to the known/trusted interpreter.
        bytes32 interpreterHash_;
        assembly ("memory-safe") {
            interpreterHash_ := extcodehash(interpreter_)
        }
        if (interpreterHash_ != INTERPRETER_BYTECODE_HASH) {
            console.logBytes(abi.encodePacked(interpreterHash_));
            revert("BAD_INTERPRETER_HASH");
        }

        emit ValidInterpreter(msg.sender, interpreter_);
    }

    function localIntegrityFunctionPointers()
        internal
        pure
        virtual
        override
        returns (
            function(IntegrityState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory
        )
    {
        function(IntegrityState memory, Operand, StackTop)
            view
            returns (StackTop)[]
            memory localFnPtrs_ = new function(
                IntegrityState memory,
                Operand,
                StackTop
            ) view returns (StackTop)[](1);
        localFnPtrs_[0] = OpGet.integrity;
        return localFnPtrs_;
    }

    function deployExpression(
        StateConfig memory config_,
        uint[] memory minStackOutputs_
    ) external returns (address, uint256) {
        (uint256 contextReads_, uint256 stackLength_) = ensureIntegrity(
            config_.sources,
            config_.constants.length,
            minStackOutputs_
        );

        bytes memory stateBytes_ = config_.serialize(
            stackLength_,
            OPCODE_FUNCTION_POINTERS
        );

        address expressionAddress_ = SSTORE2.write(stateBytes_);

        emit DeployExpression(
            msg.sender,
            config_,
            expressionAddress_,
            contextReads_
        );
        return (expressionAddress_, contextReads_);
    }

    function ensureIntegrity(
        bytes[] memory sources_,
        uint256 constantsLength_,
        uint[] memory minStackOutputs_
    ) internal view returns (uint256 contextReads_, uint256 stackLength_) {
        require(sources_.length >= minStackOutputs_.length, "BAD_MSO_LENGTH");
        IntegrityState memory integrityState_ = IntegrityState(
            sources_,
            constantsLength_,
            StackTop.wrap(0),
            StackTop.wrap(0),
            0,
            integrityFunctionPointers()
        );
        for (uint256 i_ = 0; i_ < minStackOutputs_.length; i_++) {
            LibIntegrityState.ensureIntegrity(
                integrityState_,
                SourceIndex.wrap(i_),
                StackTop.wrap(0),
                minStackOutputs_[i_]
            );
        }
        return (
            integrityState_.contextReads,
            integrityState_.stackBottom.toIndex(integrityState_.stackMaxTop)
        );
    }
}
