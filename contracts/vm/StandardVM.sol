// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "./RainVM.sol";
import "./VMStateBuilder.sol";
import "./ops/AllStandardOps.sol";

contract StandardVM is RainVM {
    address internal immutable self;
    address internal immutable vmStateBuilder;
    address internal vmStatePointer;

    constructor(address vmStateBuilder_) {
        self = address(this);
        vmStateBuilder = vmStateBuilder_;
    }

    function _initializeStandardVM(
        StateConfig memory config_,
        Bounds[] memory boundss_
    ) internal {
        bytes memory stateBytes_ = VMStateBuilder(vmStateBuilder).buildState(
            self,
            config_,
            boundss_
        );
        vmStatePointer = SSTORE2.write(stateBytes_);
    }

    function localFnPtrs()
        internal
        pure
        virtual
        returns (uint[] memory localFnPtrs_)
    {}

    function fnPtrs() public pure virtual override returns (uint[] memory) {
        return AllStandardOps.fnPtrs(localFnPtrs());
    }
}
