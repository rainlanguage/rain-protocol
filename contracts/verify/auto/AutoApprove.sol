// SPDX-License-Identifier: CAL
pragma solidity =0.8.18;

import {LibEvidence, Verify} from "../Verify.sol";
import "../VerifyCallback.sol";
import "../../array/LibUint256Array.sol";
import {AllStandardOps} from "../../interpreter/ops/AllStandardOps.sol";
import "../../interpreter/deploy/IExpressionDeployerV1.sol";
import "../../interpreter/run/IInterpreterV1.sol";
import "../../interpreter/caller/IInterpreterCallerV1.sol";
import "../../interpreter/run/LibStackPointer.sol";
import "../../interpreter/run/LibEncodedDispatch.sol";
import "../../interpreter/caller/LibContext.sol";
import "../../interpreter/deploy/DeployerDiscoverableMetaV1.sol";
import "../../interpreter/run/LibEvaluable.sol";
import "../../factory/ICloneableV1.sol";

bytes32 constant CALLER_META_HASH = bytes32(
    0x5ca2c16fbf02f00514cdb68a42de1aa7b150b73b548bdbb2f9671db43290a7ca
);

uint256 constant CAN_APPROVE_MIN_OUTPUTS = 1;
uint256 constant CAN_APPROVE_MAX_OUTPUTS = 1;
SourceIndex constant CAN_APPROVE_ENTRYPOINT = SourceIndex.wrap(0);

struct AutoApproveConfig {
    address owner;
    EvaluableConfig evaluableConfig;
}

contract AutoApprove is
    ICloneableV1,
    VerifyCallback,
    IInterpreterCallerV1,
    DeployerDiscoverableMetaV1
{
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

    Evaluable internal evaluable;

    constructor(
        DeployerDiscoverableMetaV1ConstructionConfig memory config_
    ) DeployerDiscoverableMetaV1(CALLER_META_HASH, config_) {
        _disableInitializers();
    }

    /// @inheritdoc ICloneableV1
    function initialize(bytes calldata data_) external initializer {
        verifyCallbackInit();

        AutoApproveConfig memory config_ = abi.decode(
            data_,
            (AutoApproveConfig)
        );

        _transferOwnership(config_.owner);
        emit Initialize(msg.sender, config_);
        (
            IInterpreterV1 interpreter_,
            IInterpreterStoreV1 store_,
            address expression_
        ) = config_.evaluableConfig.deployer.deployExpression(
                config_.evaluableConfig.sources,
                config_.evaluableConfig.constants,
                LibUint256Array.arrayFrom(CAN_APPROVE_MIN_OUTPUTS)
            );
        evaluable = Evaluable(interpreter_, store_, expression_);
    }

    function afterAdd(
        address,
        Evidence[] calldata evidences_
    ) external virtual override {
        unchecked {
            uint256[] memory approvedRefs_ = new uint256[](evidences_.length);
            uint256 approvals_ = 0;
            uint256[][] memory context_ = new uint256[][](1);
            context_[0] = new uint256[](2);
            Evaluable memory evaluable_ = evaluable;
            for (uint256 i_ = 0; i_ < evidences_.length; i_++) {
                // Currently we only support 32 byte evidence for auto approve.
                if (evidences_[i_].data.length == 0x20) {
                    context_[0][0] = uint256(uint160(evidences_[i_].account));
                    context_[0][1] = uint256(bytes32(evidences_[i_].data));
                    emit Context(msg.sender, context_);
                    (
                        uint256[] memory stack_,
                        uint256[] memory kvs_
                    ) = evaluable_.interpreter.eval(
                            evaluable_.store,
                            DEFAULT_STATE_NAMESPACE,
                            LibEncodedDispatch.encode(
                                evaluable_.expression,
                                CAN_APPROVE_ENTRYPOINT,
                                CAN_APPROVE_MAX_OUTPUTS
                            ),
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
                        evaluable_.store.set(DEFAULT_STATE_NAMESPACE, kvs_);
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
