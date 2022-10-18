// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "./LibVMState.sol";
import "./RainVM.sol";
import "../integrity/RainVMIntegrity.sol";
import "../ops/AllStandardOps.sol";

uint256 constant DEFAULT_SOURCE_ID = 0;
uint256 constant DEFAULT_MIN_FINAL_STACK = 1;

contract StandardVM is RainVM {
    using LibVMState for bytes;
    using LibUint256Array for uint256;

    event SaveVMState(address sender, uint256 id, StateConfig config);

    address internal immutable self;
    address internal immutable vmIntegrity;

    /// Address of the immutable rain script deployed as a `VMState`.
    mapping(uint256 => address) internal vmStatePointers;

    constructor(address vmIntegrity_) {
        self = address(this);
        vmIntegrity = vmIntegrity_;
    }

    function _saveVMState(StateConfig memory config_) internal {
        return _saveVMState(DEFAULT_SOURCE_ID, config_);
    }

    function _saveVMState(uint256 id_, StateConfig memory config_) internal {
        return _saveVMState(id_, config_, DEFAULT_MIN_FINAL_STACK);
    }

    function _saveVMState(StateConfig memory config_, uint256 finalMinStack_)
        internal
    {
        return _saveVMState(DEFAULT_SOURCE_ID, config_, finalMinStack_);
    }

    function _saveVMState(
        uint256 id_,
        StateConfig memory config_,
        uint256 finalMinStack_
    ) internal {
        return _saveVMState(id_, config_, finalMinStack_.arrayFrom());
    }

    function _saveVMState(
        StateConfig memory config_,
        uint256[] memory finalMinStacks_
    ) internal {
        return _saveVMState(DEFAULT_SOURCE_ID, config_, finalMinStacks_);
    }

    function _saveVMState(
        uint256 id_,
        StateConfig memory config_,
        uint256[] memory finalMinStacks_
    ) internal virtual {
        bytes memory stateBytes_ = buildStateBytes(
            IRainVMIntegrity(vmIntegrity),
            config_,
            finalMinStacks_
        );
        emit SaveVMState(msg.sender, id_, config_);
        vmStatePointers[id_] = SSTORE2.write(stateBytes_);
    }

    function _loadVMState() internal view returns (VMState memory) {
        return _loadVMState(DEFAULT_SOURCE_ID);
    }

    function _loadVMState(uint256 id_) internal view returns (VMState memory) {
        return _loadVMState(id_, new uint256[](0));
    }

    function _loadVMState(uint256[] memory context_)
        internal
        view
        returns (VMState memory)
    {
        return _loadVMState(DEFAULT_SOURCE_ID, context_);
    }

    function _loadVMState(uint256 id_, uint256[] memory context_)
        internal
        view
        virtual
        returns (VMState memory)
    {
        address pointer_ = vmStatePointers[id_];
        require(pointer_ != address(0), "UNKNOWN_STATE");
        return SSTORE2.read(pointer_).deserialize(context_);
    }

    function localEvalFunctionPointers()
        internal
        pure
        virtual
        returns (
            function(VMState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory localFnPtrs_
        )
    {}

    /// @inheritdoc RainVM
    function opcodeFunctionPointers()
        internal
        view
        virtual
        override
        returns (
            function(VMState memory, Operand, StackTop)
                view
                returns (StackTop)[]
                memory
        )
    {
        return
            AllStandardOps.opcodeFunctionPointers(localEvalFunctionPointers());
    }
}
