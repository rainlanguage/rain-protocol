// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import {LibEvidence, Verify} from "../Verify.sol";
import "../VerifyCallback.sol";
import "../../vm/StandardVM.sol";
import {AllStandardOps} from "../../vm/ops/AllStandardOps.sol";

uint256 constant ENTRYPOINT = 0;
uint256 constant MIN_FINAL_STACK_INDEX = 1;

uint256 constant OP_EVIDENCE_DATA_APPROVED = 0;
uint256 constant LOCAL_OPS_LENGTH = 1;

contract AutoApprove is VerifyCallback, StandardVM, Initializable {
    using LibStackTop for StackTop;

    /// Contract has initialized.
    /// @param sender `msg.sender` initializing the contract (factory).
    /// @param config All initialized config.
    event Initialize(address sender, StateConfig config);

    using LibVMState for VMState;

    mapping(uint256 => uint256) private _approvedEvidenceData;

    constructor(address vmStateBuilder_) StandardVM(vmStateBuilder_) {
        _disableInitializers();
    }

    function initialize(StateConfig calldata stateConfig_)
        external
        initializer
    {
        Bounds memory bounds_;
        bounds_.entrypoint = ENTRYPOINT;
        bounds_.minFinalStackIndex = MIN_FINAL_STACK_INDEX;
        Bounds[] memory boundss_ = new Bounds[](1);
        boundss_[0] = bounds_;
        _saveVMState(stateConfig_, boundss_);
        _transferOwnership(msg.sender);

        emit Initialize(msg.sender, stateConfig_);
    }

    function afterAdd(address, Evidence[] calldata evidences_)
        external
        virtual
        override
    {
        unchecked {
            uint256[] memory approvedRefs_ = new uint256[](evidences_.length);
            uint256 approvals_ = 0;
            uint256[] memory context_ = new uint256[](2);
            VMState memory state_ = _loadVMState();
            for (uint256 i_ = 0; i_ < evidences_.length; i_++) {
                // Currently we only support 32 byte evidence for auto approve.
                if (evidences_[i_].data.length == 0x20) {
                    context_[0] = uint256(uint160(evidences_[i_].account));
                    context_[1] = uint256(bytes32(evidences_[i_].data));
                    eval(context_, state_, ENTRYPOINT);
                    if (state_.stack[state_.stackIndex - 1] > 0) {
                        _approvedEvidenceData[
                            uint256(bytes32(evidences_[i_].data))
                        ] = block.timestamp;
                        LibEvidence._updateEvidenceRef(
                            approvedRefs_,
                            evidences_[i_],
                            approvals_
                        );
                        approvals_++;
                    }
                    state_.reset();
                }
            }
            if (approvals_ > 0) {
                LibEvidence._resizeRefs(approvedRefs_, approvals_);
                Verify(msg.sender).approve(
                    LibEvidence._refsAsEvidences(approvedRefs_)
                );
            }
        }
    }

    function opEvidenceDataApproved(uint256, StackTop stackTop_)
        internal
        view
        returns (StackTop)
    {
        (StackTop location_, uint256 evidenceData_) = stackTop_.peek();
        location_.set(_approvedEvidenceData[evidenceData_]);
        return stackTop_;
    }

    function localFnPtrs()
        internal
        pure
        virtual
        override
        returns (
            function(uint256, StackTop) view returns (StackTop)[]
                memory localFnPtrs_
        )
    {
        localFnPtrs_ = new function(uint256, StackTop)
            view
            returns (StackTop)[](1);
        localFnPtrs_[0] = opEvidenceDataApproved;
    }
}
