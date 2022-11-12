// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "./libraries/LibFlow.sol";
import "../idempotent/LibIdempotentFlag.sol";
import "../interpreter/deploy/IExpressionDeployerV1.sol";
import "../interpreter/run/IInterpreterV1.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {MulticallUpgradeable as Multicall} from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";
import {ERC721HolderUpgradeable as ERC721Holder} from "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import {ERC1155HolderUpgradeable as ERC1155Holder} from "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import {SignatureCheckerUpgradeable as SignatureChecker} from "@openzeppelin/contracts-upgradeable/utils/cryptography/SignatureCheckerUpgradeable.sol";
import {ECDSAUpgradeable as ECDSA} from "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "../interpreter/run/LibEncodedDispatch.sol";

uint256 constant FLAG_COLUMN_FLOW_ID = 0;
uint256 constant FLAG_ROW_FLOW_ID = 0;
uint256 constant FLAG_COLUMN_FLOW_TIME = 0;
uint256 constant FLAG_ROW_FLOW_TIME = 2;

uint256 constant MIN_FLOW_SENTINELS = 4;

SourceIndex constant FLOW_ENTRYPOINT = SourceIndex.wrap(0);
uint constant FLOW_MAX_OUTPUTS = type(uint16).max;

struct SignedContext {
    address signer;
    bytes signature;
    uint256[] context;
}

struct FlowCommonConfig {
    address expressionDeployer;
    address interpreter;
    StateConfig[] flows;
}

contract FlowCommon is ERC721Holder, ERC1155Holder, Multicall {
    using LibIdempotentFlag for IdempotentFlag;
    using LibInterpreterState for InterpreterState;
    using LibStackTop for StackTop;
    using LibStackTop for uint256[];
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];

    IInterpreterV1 internal _interpreter;

    /// flow expression pointer => is registered
    mapping(EncodedDispatch => uint) internal _flows;

    event FlowInitialized(address sender, address interpreter, EncodedDispatch dispatch);

    constructor() {
        _disableInitializers();
    }

    // solhint-disable-next-line func-name-mixedcase
    function __FlowCommon_init(
        FlowCommonConfig memory config_,
        uint flowMinOutputs_
    ) internal onlyInitializing {
        __ERC721Holder_init();
        __ERC1155Holder_init();
        __Multicall_init();
        require(flowMinOutputs_ >= MIN_FLOW_SENTINELS, "BAD MIN STACKS LENGTH");
        _interpreter = IInterpreterV1(config_.interpreter);
        for (uint256 i_ = 0; i_ < config_.flows.length; i_++) {
            (
                address expression_,
                uint256 contextReads_
            ) = IExpressionDeployerV1(config_.expressionDeployer)
                    .deployExpression(
                        config_.flows[i_],
                        LibEncodedConstraints.arrayFrom(
                            LibEncodedConstraints.encode(
                                LibEncodedConstraints.expressionsTrustEachOtherNamespaceSeed(),
                                flowMinOutputs_
                            )
                        )
                    );
            EncodedDispatch dispatch_ = LibEncodedDispatch.encode(
                        expression_,
                        FLOW_ENTRYPOINT,
                        FLOW_MAX_OUTPUTS
                    );
            _flows[dispatch_] = 1;
            emit FlowInitialized(msg.sender, config_.interpreter, dispatch_);
        }
    }

    function _buildFlowBaseContext(
        EncodedDispatch dispatch_,
        uint256 id_
    ) internal view returns (uint256[] memory) {
        // THIS IS A CRITICAL SECURITY CHECK. REMOVING THIS ALLOWS ARBITRARY
        // EXPRESSIONS TO BE BUILT AND RUN AS FLOWS.
        require(_flows[dispatch_] > 0, "UNREGISTERED_FLOW");

        return LibUint256Array.arrayFrom(uint256(uint160(msg.sender)), id_);
    }

    function flowStack(
        EncodedDispatch dispatch_,
        uint256 id_,
        SignedContext[] memory signedContexts_
    ) internal view returns (StackTop, StackTop, uint[] memory) {
        unchecked {
            uint256[] memory flowBaseContext_ = _buildFlowBaseContext(
                dispatch_,
                id_
            );

            uint256[] memory signers_ = new uint256[](signedContexts_.length);
            uint256[][] memory flowContext_ = new uint256[][](
                signedContexts_.length + 2
            );
            for (uint256 i_ = 0; i_ < signedContexts_.length; i_++) {
                signers_[i_] = uint256(uint160(signedContexts_[i_].signer));

                require(
                    SignatureChecker.isValidSignatureNow(
                        signedContexts_[i_].signer,
                        ECDSA.toEthSignedMessageHash(
                            keccak256(
                                abi.encodePacked(signedContexts_[i_].context)
                            )
                        ),
                        signedContexts_[i_].signature
                    ),
                    "INVALID_SIGNATURE"
                );
                flowContext_[i_ + 2] = signedContexts_[i_].context;
            }

            flowContext_[0] = flowBaseContext_;
            flowContext_[1] = signers_;

            IInterpreterV1 interpreter_ = _interpreter;

            (
                uint256[] memory stack_,
                uint[] memory stateChanges_
            ) = interpreter_.eval(
                    dispatch_,
                    flowContext_
                );
            return (
                stack_.asStackTopUp(),
                stack_.asStackTopAfter(),
                stateChanges_
            );
        }
    }

    receive() external payable virtual {}
}
