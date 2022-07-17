// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "./RainVM.sol";
import "./VMStateBuilder.sol";
import "./ops/AllStandardOps.sol";

contract StandardVM is RainVM {
    address internal immutable self;
    address internal immutable vmStateBuilder;

    /// Address of the immutable rain script deployed as a `VMState`.
    address internal vmStatePointer;

    constructor(address vmStateBuilder_) {
        self = address(this);
        vmStateBuilder = vmStateBuilder_;
    }

    function _saveVMState(StateConfig memory config_, Bounds[] memory boundss_)
        internal
    {
        bytes memory stateBytes_ = VMStateBuilder(vmStateBuilder).buildState(
            self,
            config_,
            boundss_
        );
        vmStatePointer = SSTORE2.write(stateBytes_);
    }

    function _loadVMState() internal view returns (State memory) {
        return LibState.fromBytesPacked(SSTORE2.read(vmStatePointer));
    }

    function localFnPtrs()
        internal
        pure
        virtual
        returns (
            function(uint256, StackTop) view returns (StackTop)[]
                memory localFnPtrs_
        )
    {}

    /// @inheritdoc RainVM
    function packedFunctionPointers()
        public
        view
        virtual
        override
        returns (bytes memory)
    {
        return AllStandardOps.packedFunctionPointers(localFnPtrs());
    }
}
