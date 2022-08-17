// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import {StandardVM} from "../vm/runtime/StandardVM.sol";
import "../vm/integrity/RainVMIntegrity.sol";

contract MinimalStandardVM is StandardVM {
    using LibVMState for VMState;

    constructor (address vmIntegrity_, StateConfig memory config_) StandardVM(vmIntegrity_) {
        _saveVMState(config_);
    }

    function eval() external pure {
        _loadVMState().eval();
    }
}