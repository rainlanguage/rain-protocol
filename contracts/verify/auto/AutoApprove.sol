// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

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
    /// Contract has initialized.
    /// @param sender `msg.sender` initializing the contract (factory).
    /// @param config All initialized config.
    event Initialize(address sender, StateConfig config);

    using LibState for State;
    using LibFnPtrs for bytes;

    mapping(uint256 => uint256) private _approvedEvidenceData;

    constructor(address vmStateBuilder_) StandardVM(vmStateBuilder_) {}

    function initialize(StateConfig calldata stateConfig_)
        external
        initializer
    {
        Bounds memory bounds_;
        bounds_.entrypoint = ENTRYPOINT;
        bounds_.minFinalStackIndex = MIN_FINAL_STACK_INDEX;
        Bounds[] memory boundss_ = new Bounds[](1);
        boundss_[0] = bounds_;
        _initializeStandardVM(stateConfig_, boundss_);

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
            bytes memory context_;
            State memory state_ = LibState.fromBytesPacked(
                SSTORE2.read(vmStatePointer)
            );
            for (uint256 i_ = 0; i_ < evidences_.length; i_++) {
                // Currently we only support 32 byte evidence for auto approve.
                if (evidences_[i_].data.length == 0x20) {
                    context_ = evidences_[i_].data;
                    eval(context_, state_, ENTRYPOINT);
                    if (state_.stack[state_.stackIndex - 1] > 0) {
                        _approvedEvidenceData[
                            uint256(bytes32(context_))
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

    function opEvidenceDataApproved(uint256, uint256 stackTopLocation_)
        internal
        view
        returns (uint256)
    {
        uint256 location_;
        uint256 evidenceData_;
        assembly {
            location_ := sub(stackTopLocation_, 0x20)
            evidenceData_ := mload(location_)
        }
        uint256 approved_ = _approvedEvidenceData[evidenceData_];
        assembly {
            mstore(location_, approved_)
        }
        return stackTopLocation_;
    }

    function localFnPtrs()
        internal
        pure
        virtual
        override
        returns (bytes memory localFnPtrs_)
    {
        unchecked {
            localFnPtrs_ = new bytes(LOCAL_OPS_LENGTH * 0x20);
            localFnPtrs_.insertOpPtr(
                OP_EVIDENCE_DATA_APPROVED,
                opEvidenceDataApproved
            );
        }
    }
}
