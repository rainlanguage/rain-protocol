// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../../interpreter/runtime/StandardInterpreter.sol";
import "../libraries/LibFlow.sol";
import "../../idempotent/LibIdempotentFlag.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ERC721HolderUpgradeable as ERC721Holder} from "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import {ERC1155HolderUpgradeable as ERC1155Holder} from "@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol";
import {SignatureCheckerUpgradeable as SignatureChecker} from "@openzeppelin/contracts-upgradeable/utils/cryptography/SignatureCheckerUpgradeable.sol";
import {ECDSAUpgradeable as ECDSA} from "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";

uint256 constant FLAG_COLUMN_FLOW_TIME = 0;
uint256 constant FLAG_ROW_FLOW_TIME = 1;

uint256 constant ENTRYPOINTS_COUNT = 3;
SourceIndex constant CAN_SIGN_CONTEXT_ENTRYPOINT = SourceIndex.wrap(0);
SourceIndex constant CAN_FLOW_ENTRYPOINT = SourceIndex.wrap(1);
SourceIndex constant FLOW_ENTRYPOINT = SourceIndex.wrap(2);

uint256 constant CORE_SOURCE_ID = 0;

struct SignedContext {
    address signer;
    bytes signature;
    uint256[] context;
}

contract FlowInterpreter is ERC721Holder, ERC1155Holder, StandardInterpreter {
    using LibIdempotentFlag for IdempotentFlag;
    using LibInterpreterState for InterpreterState;
    using LibStackTop for StackTop;
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];

    /// flow index => id => time
    mapping(uint256 => mapping(uint256 => uint256)) private _flows;

    constructor(address interpreterIntegrity_)
        StandardInterpreter(interpreterIntegrity_)
    {}

    /// @param flows_ source and token config. Also controls delegated claims.
    // solhint-disable-next-line func-name-mixedcase
    function __FlowInterpreter_init(
        StateConfig[] memory flows_,
        uint256 flowFinalMinStack_
    ) internal onlyInitializing {
        __ERC721Holder_init();
        __ERC1155Holder_init();
        // Can't be less than an empty standard flow of sentinels.
        require(flowFinalMinStack_ >= 4, "BAD MIN STACKS LENGTH");
        for (uint256 i_ = 0; i_ < flows_.length; i_++) {
            uint256 id_ = uint256(keccak256(abi.encode(flows_[i_])));
            _saveInterpreterState(
                id_,
                flows_[i_],
                LibUint256Array.arrayFrom(1, 1, flowFinalMinStack_)
            );
        }
    }

    function _loadFlowState(
        uint256 flow_,
        uint256 id_
    ) internal view returns (InterpreterState memory) {
        require(id_ != CORE_SOURCE_ID, "CORE_SOURCE_ID");
        InterpreterState memory state_ = _loadInterpreterState(flow_);
        // This column MUST match the flags tracked in the context grid.
        state_.context = LibUint256Array
            .arrayFrom(
                id_,
                loadFlowTime(
                    IdempotentFlag.wrap(state_.contextScratch),
                    flow_,
                    id_
                )
            )
            .matrixFrom();
        return state_;
    }

    function flowStack(
        InterpreterState memory state_,
        SignedContext[] memory signedContexts_
    ) internal view returns (StackTop) {
        unchecked {
            // Only context built by _loadFlowState is supported.
            require(state_.context.length == 1, "UNEXPECTED_CONTEXT");
            uint256[][] memory canSignContext_ = new uint256[][](2);
            canSignContext_[0] = state_.context[0];

            uint256[][] memory flowContext_ = new uint256[][](
                signedContexts_.length + 1
            );
            flowContext_[0] = state_.context[0];

            for (uint256 i_ = 0; i_ < signedContexts_.length; i_++) {
                canSignContext_[1] = LibUint256Array.arrayFrom(
                    i_,
                    uint256(uint160(signedContexts_[i_].signer))
                );
                state_.context = canSignContext_;
                require(
                    state_.eval(CAN_SIGN_CONTEXT_ENTRYPOINT).peek() > 0,
                    "BAD_SIGNER"
                );
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
                flowContext_[i_ + 1] = signedContexts_[i_].context;
            }

            state_.context = flowContext_;
            require(state_.eval(CAN_FLOW_ENTRYPOINT).peek() > 0, "CANT_FLOW");
            return state_.eval(FLOW_ENTRYPOINT);
        }
    }

    function loadFlowTime(
        IdempotentFlag flag_,
        uint256 flow_,
        uint256 id_
    ) internal view returns (uint256) {
        return
            flag_.get16x16(FLAG_COLUMN_FLOW_TIME, FLAG_ROW_FLOW_TIME)
                ? _flows[flow_][id_]
                : 0;
    }

    function registerFlowTime(
        IdempotentFlag flag_,
        uint256 flow_,
        uint256 id_
    ) internal {
        if (flag_.get16x16(FLAG_COLUMN_FLOW_TIME, FLAG_ROW_FLOW_TIME)) {
            _flows[flow_][id_] = block.timestamp;
        }
    }

    function _flowTime(uint256 flow_, uint256 id_)
        internal
        view
        returns (uint256 flowTime_)
    {
        return _flows[flow_][id_];
    }

    receive() external payable virtual {}
}
