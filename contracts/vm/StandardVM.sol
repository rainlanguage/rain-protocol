// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

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
            function(uint256, uint256) view returns (uint256)[]
                memory localFnPtrs_
        )
    {}

    /// @inheritdoc RainVM
    function packedFunctionPointers()
        public
        pure
        virtual
        override
        returns (bytes memory ptrs_)
    {
        ptrs_ = consumeAndPackFnPtrs(AllStandardOps.fnPtrs(localFnPtrs()));
    }

    /// Modifies a list of function pointers INLINE to a packed bytes where each
    /// pointer is 2 bytes instead of 32 in the final bytes.
    /// As the output is ALWAYS equal or less length than the input AND we never
    /// use the input after it has been packed, we modify and re-type the input
    /// directly/mutably. This avoids unnecessary memory allocations but has the
    /// effect that it is NOT SAFE to use `fnPtrs_` after it has been consumed.
    /// The caller MUST ensure safety so this function is private rather than
    /// internal to prevent it being accidentally misused outside this contract.
    function consumeAndPackFnPtrs(
        function(uint256, uint256) view returns (uint256)[] memory fnPtrs_
    ) private pure returns (bytes memory fnPtrsPacked_) {
        unchecked {
            assembly {
                for {
                    let cursor_ := add(fnPtrs_, 0x20)
                    let end_ := add(cursor_, mul(0x20, mload(fnPtrs_)))
                    let oCursor_ := add(fnPtrs_, 0x02)
                } lt(cursor_, end_) {
                    cursor_ := add(cursor_, 0x20)
                    oCursor_ := add(oCursor_, 0x02)
                } {
                    mstore(oCursor_, or(mload(oCursor_), mload(cursor_)))
                }
                mstore(fnPtrs_, mul(2, mload(fnPtrs_)))
                fnPtrsPacked_ := fnPtrs_
            }
            return fnPtrsPacked_;
        }
    }
}
