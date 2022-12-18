// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../deploy/IExpressionDeployerV1.sol";
import "../deploy/StandardIntegrity.sol";
import "../ops/core/OpGet.sol";

bytes constant OPCODE_FUNCTION_POINTERS = hex"0b130b210b770bc90c470c730d0c0dd60e0b0e290eb10ec00ece0edc0eea0ec00ef80f060f140f230f320f400f4e0f5c0f6a0fe20ff11000100f101e102d10761088109610c810d610e410f211011110111f112e113d114c115b116a11791188119711a511b311c111cf11dd11eb11f9120812171225129c0a79";
bytes32 constant OPCODE_FUNCTION_POINTERS_HASH = keccak256(
    OPCODE_FUNCTION_POINTERS
);
bytes32 constant INTERPRETER_BYTECODE_HASH = bytes32(
    0x1692d71add7f29b731feaa0bf40940353e9c35f1885e3aa39212fe661589ca65
);

contract RainterpreterExpressionDeployer is
    StandardIntegrity,
    IExpressionDeployerV1
{
    using LibInterpreterState for StateConfig;

    event DeployExpression(
        address sender,
        StateConfig config,
        address expressionAddress,
        uint256 contextReads
    );

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

    /// @inheritdoc IExpressionDeployerV1
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

    /// Returns the interpreter that this `RainterpreterExpressionDeployer` is
    /// intended to deploy expressions for. As there can be many identical
    /// deployers and interpreters on the same chain and across chains this
    /// returns the hashes of the interpreter bytecode and function pointers as
    /// returned by `IInterpreterV1.functionPointers`.
    ///
    /// Note that a malicious contract can always lie about these values so it
    /// is not sufficient to simply call this function offchain and trust that
    /// it will do the right thing. Offchain security considerations MUST
    /// consider the full bytecode of BOTH the interpreter and deployer.
    ///
    /// This function exists to allow automated testing and monitoring processes
    /// to detect HONEST MISTAKES in a deployer/interpreter mispairing so that
    /// an incompatible deployer is not ACCIDENTALLY shipped alongside some
    /// interpreter bytecode.
    function intepreter() external pure returns (bytes32, bytes32) {
        return (INTERPRETER_BYTECODE_HASH, OPCODE_FUNCTION_POINTERS_HASH);
    }
}
