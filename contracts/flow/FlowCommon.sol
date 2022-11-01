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

uint256 constant FLAG_COLUMN_FLOW_ID = 0;
uint256 constant FLAG_ROW_FLOW_ID = 0;
uint256 constant FLAG_COLUMN_FLOW_TIME = 0;
uint256 constant FLAG_ROW_FLOW_TIME = 1;

uint256 constant MIN_FLOW_SENTINELS = 4;

SourceIndex constant FLOW_ENTRYPOINT = SourceIndex.wrap(0);

struct SignedContext {
    address signer;
    bytes signature;
    uint256[] context;
}

struct FlowCommonConfig {
    address expressionDeployer;
    address interpreter;
    StateConfig[] flows;
    uint256 flowFinalMinStack;
}

contract FlowCommon is ERC721Holder, ERC1155Holder, Multicall {
    using LibIdempotentFlag for IdempotentFlag;
    using LibInterpreterState for InterpreterState;
    using LibStackTop for StackTop;
    using LibStackTop for uint256[];
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];

    IInterpreterV1 internal _interpreter;

    /// flow expression pointer => context scratch
    mapping(address => IdempotentFlag) internal _flowContextScratches;
    /// flow expression pointer => id => time
    mapping(address => mapping(uint256 => uint256)) internal _flowTimes;

    constructor() {
        _disableInitializers();
    }

    // solhint-disable-next-line func-name-mixedcase
    function __FlowCommon_init(FlowCommonConfig memory config_)
        internal
        onlyInitializing
    {
        __ERC721Holder_init();
        __ERC1155Holder_init();
        __Multicall_init();
        require(
            config_.flowFinalMinStack >= MIN_FLOW_SENTINELS,
            "BAD MIN STACKS LENGTH"
        );
        _interpreter = IInterpreterV1(config_.interpreter);
        for (uint256 i_ = 0; i_ < config_.flows.length; i_++) {
            (
                address expressionAddress_,
                uint256 contextScratch_
            ) = IExpressionDeployerV1(config_.expressionDeployer)
                    .deployExpression(
                        config_.flows[i_],
                        LibUint256Array.arrayFrom(config_.flowFinalMinStack)
                    );
            // The context scratch MUST set at least one flag otherwise
            // `_buildFlowContext` will refuse to build a context for it.
            // The ID is always set in the context so there's no harm in always
            // tracking it in the scratch.
            _flowContextScratches[expressionAddress_] = IdempotentFlag
                .wrap(contextScratch_)
                .set16x16(FLAG_COLUMN_FLOW_ID, FLAG_ROW_FLOW_ID);
        }
    }

    function _buildFlowBaseContext(address flow_, uint256 id_)
        internal
        view
        returns (uint256[] memory)
    {
        IdempotentFlag contextScratch_ = _flowContextScratches[flow_];

        // THIS IS A CRITICAL SECURITY CHECK. REMOVING THIS ALLOWS ARBITRARY
        // EXPRESSIONS TO BE BUILT AND RUN AS FLOWS.
        require(
            IdempotentFlag.unwrap(contextScratch_) > 0,
            "UNREGISTERED_FLOW"
        );

        // This column MUST match the flags tracked in the context grid.
        return
            LibUint256Array.arrayFrom(
                uint256(uint160(msg.sender)),
                id_,
                loadFlowTime(contextScratch_, flow_, id_)
            );
    }

    function flowStack(
        address flow_,
        uint256 id_,
        SignedContext[] memory signedContexts_
    ) internal view returns (StackTop, StackTop) {
        unchecked {
            uint256[] memory flowBaseContext_ = _buildFlowBaseContext(
                flow_,
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

            uint256[] memory stack_ = interpreter_.eval(
                flow_,
                FLOW_ENTRYPOINT,
                flowContext_
            );
            return (stack_.asStackTopUp(), stack_.asStackTopAfter());
        }
    }

    function loadFlowTime(IdempotentFlag flag_, address flow_, uint256 id_)
        internal
        view
        returns (uint256)
    {
        return
            flag_.get16x16(FLAG_COLUMN_FLOW_TIME, FLAG_ROW_FLOW_TIME)
                ? _flowTimes[flow_][id_]
                : 0;
    }

    function registerFlowTime(IdempotentFlag flag_, address flow_, uint256 id_)
        internal
    {
        if (flag_.get16x16(FLAG_COLUMN_FLOW_TIME, FLAG_ROW_FLOW_TIME)) {
            _flowTimes[flow_][id_] = block.timestamp;
        }
    }

    function _flowTime(address flow_, uint256 id_)
        internal
        view
        returns (uint256 flowTime_)
    {
        return _flowTimes[flow_][id_];
    }

    receive() external payable virtual {}
}
