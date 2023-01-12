// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import {LibEvidence, Verify} from "../Verify.sol";
import "../VerifyCallback.sol";
import "../../array/LibUint256Array.sol";
import {AllStandardOps} from "../../interpreter/ops/AllStandardOps.sol";
import "../../interpreter/deploy/IExpressionDeployerV1.sol";
import "../../interpreter/run/IInterpreterV1.sol";
import "../../interpreter/run/LibStackPointer.sol";
import "../../interpreter/run/LibEncodedDispatch.sol";
import "../../interpreter/run/LibContext.sol";
import "../../interpreter/run/IInterpreterCallerV1.sol";

uint256 constant CAN_APPROVE_MIN_OUTPUTS = 1;
uint256 constant CAN_APPROVE_MAX_OUTPUTS = 1;
SourceIndex constant CAN_APPROVE_ENTRYPOINT = SourceIndex.wrap(0);

struct AutoApproveConfig {
    address expressionDeployer;
    address interpreter;
    StateConfig stateConfig;
}

contract AutoApprove is VerifyCallback, IInterpreterCallerV1 {
    using LibStackPointer for StackPointer;
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];
    using LibEvidence for uint256[];
    using LibStackPointer for uint256[];
    using LibStackPointer for StackPointer;

    /// Contract has initialized.
    /// @param sender `msg.sender` initializing the contract (factory).
    /// @param config All initialized config.
    event Initialize(address sender, AutoApproveConfig config);

    IInterpreterV1 internal interpreter;
    address internal expression;

    constructor() {
        _disableInitializers();
    }

    function initialize(
        AutoApproveConfig calldata config_
    ) external initializer {
        __VerifyCallback_init();

        expression = IExpressionDeployerV1(config_.expressionDeployer)
            .deployExpression(
                config_.stateConfig,
                LibUint256Array.arrayFrom(CAN_APPROVE_MIN_OUTPUTS)
            );
        interpreter = IInterpreterV1(config_.interpreter);

        _transferOwnership(msg.sender);

        emit Initialize(msg.sender, config_);
    }

    function afterAdd(
        address,
        Evidence[] calldata evidences_
    ) external virtual override {
        unchecked {
            IInterpreterV1 interpreter_ = interpreter;
            uint256[] memory approvedRefs_ = new uint256[](evidences_.length);
            uint256 approvals_ = 0;
            uint256[][] memory context_ = new uint256[][](1);
            context_[0] = new uint256[](2);
            EncodedDispatch dispatch_ = LibEncodedDispatch.encode(
                expression,
                CAN_APPROVE_ENTRYPOINT,
                CAN_APPROVE_MAX_OUTPUTS
            );
            for (uint256 i_ = 0; i_ < evidences_.length; i_++) {
                // Currently we only support 32 byte evidence for auto approve.
                if (evidences_[i_].data.length == 0x20) {
                    context_[0][0] = uint256(uint160(evidences_[i_].account));
                    context_[0][1] = uint256(bytes32(evidences_[i_].data));
                    emit Context(msg.sender, context_);
                    (
                        uint256[] memory stack_,
                        IInterpreterStoreV1 store_,
                        uint256[] memory kvs_
                    ) = interpreter_.eval(
                            DEFAULT_STATE_NAMESPACE,
                            dispatch_,
                            context_
                        );
                    if (stack_[stack_.length - 1] > 0) {
                        LibEvidence._updateEvidenceRef(
                            approvedRefs_,
                            evidences_[i_],
                            approvals_
                        );
                        approvals_++;
                    }
                    if (kvs_.length > 0) {
                        store_.set(DEFAULT_STATE_NAMESPACE, kvs_);
                    }
                }
            }

            if (approvals_ > 0) {
                approvedRefs_.truncate(approvals_);
                Verify(msg.sender).approve(approvedRefs_.asEvidences());
            }
        }
    }
}
