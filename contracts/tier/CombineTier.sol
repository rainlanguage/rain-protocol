// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import "../vm/RainVM.sol";
// solhint-disable-next-line max-line-length
import {AllStandardOps} from "../vm/ops/AllStandardOps.sol";
import {TierwiseCombine} from "./libraries/TierwiseCombine.sol";
import {ReadOnlyTier, ITier} from "./ReadOnlyTier.sol";
import "../vm/VMStateBuilder.sol";

uint256 constant ENTRYPOINT = 0;

/// @title CombineTier
/// @notice Implements `ReadOnlyTier` over RainVM. Allows combining the reports
/// from any other `ITier` contracts referenced in the `ImmutableSource` set at
/// construction.
/// The value at the top of the stack after executing the rain script will be
/// used as the return of `report`.
contract CombineTier is ReadOnlyTier, RainVM, Initializable {
    // This allows cloned contracts to forward the template contract to the VM
    // state builder during initialization.
    address private immutable self;
    address private immutable vmStateBuilder;
    address private vmStatePointer;

    constructor(address vmStateBuilder_) {
        self = address(this);
        vmStateBuilder = vmStateBuilder_;
    }

    function initialize(StateConfig calldata sourceConfig_)
        external
        initializer
    {
        bytes memory stateBytes_ = VMStateBuilder(vmStateBuilder).buildState(
            self,
            sourceConfig_,
            ENTRYPOINT + 1
        );
        vmStatePointer = SSTORE2.write(stateBytes_);
    }

    function fnPtrs() public pure override returns (bytes memory) {
        return AllStandardOps.fnPtrs();
    }

    /// @inheritdoc ITier
    function report(address account_)
        external
        view
        virtual
        override
        returns (uint256)
    {
        State memory state_ = LibState.fromBytesPacked(
            SSTORE2.read(vmStatePointer)
        );
        bytes memory context_ = new bytes(0x20);
        uint256 accountContext_ = uint256(uint160(account_));
        assembly {
            mstore(add(context_, 0x20), accountContext_)
        }
        eval(context_, state_, ENTRYPOINT);
        return state_.stack[state_.stackIndex - 1];
    }
}
