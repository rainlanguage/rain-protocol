// SPDX-License-Identifier: CAL
pragma solidity =0.8.19;

import {TierwiseCombine} from "./libraries/TierwiseCombine.sol";
import {ITierV2} from "./ITierV2.sol";
import {TierV2} from "./TierV2.sol";
import "rain.interpreter/interface/IExpressionDeployerV1.sol";
import "rain.interpreter/lib/caller/LibEncodedDispatch.sol";
import "rain.solmem/lib/LibStackPointer.sol";
import "rain.interpreter/lib/state/LibInterpreterState.sol";
import "rain.interpreter/lib/caller/LibContext.sol";
import "rain.solmem/lib/LibUint256Matrix.sol";
import "rain.interpreter/abstract/DeployerDiscoverableMetaV1.sol";
import "rain.interpreter/lib/caller/LibEvaluable.sol";
import "rain.factory/src/interface/ICloneableV2.sol";

import {ERC165CheckerUpgradeable as ERC165Checker} from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165CheckerUpgradeable.sol";

bytes32 constant CALLER_META_HASH = bytes32(
    0x79f1f9d36a1aa47f51a3a7f94f530cd9453bf2260b3214df63e939d1340bb4c8
);

SourceIndex constant REPORT_ENTRYPOINT = SourceIndex.wrap(0);
SourceIndex constant REPORT_FOR_TIER_ENTRYPOINT = SourceIndex.wrap(1);

uint256 constant REPORT_MIN_OUTPUTS = 1;
uint16 constant REPORT_MAX_OUTPUTS = 1;

uint256 constant REPORT_FOR_TIER_MIN_OUTPUTS = 1;
uint16 constant REPORT_FOR_TIER_MAX_OUTPUTS = 1;

/// All config used during initialization of a CombineTier.
/// @param combinedTiersLength The first N values in the constants array of the
/// expressionConfig MUST be all the combined tiers that are known statically. Of
/// course some tier addresses MAY only be known at runtime and so these cannot
/// be included. For those that are included there will be additional deploy
/// time checks to ensure compatibility with each other (i.e. reportUnits).
/// @param expressionConfig Source to run for both report and reportForTier as
/// sources 0 and 1 respectively.
struct CombineTierConfig {
    uint256 combinedTiersLength;
    EvaluableConfig evaluableConfig;
}

/// @title CombineTier
/// @notice Allows combining the reports from any `ITierV2` contracts.
/// The value at the top of the stack after executing the Rain expression will be
/// used as the return of all `ITierV2` functions exposed by `CombineTier`.
contract CombineTier is ICloneableV2, TierV2, DeployerDiscoverableMetaV1 {
    using LibStackPointer for Pointer;
    using LibStackPointer for uint256[];
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];

    event Initialize(address sender, CombineTierConfig config);

    Evaluable internal evaluable;

    constructor(
        DeployerDiscoverableMetaV1ConstructionConfig memory config_
    ) DeployerDiscoverableMetaV1(CALLER_META_HASH, config_) {
        _disableInitializers();
    }

    /// @inheritdoc ICloneableV2
    function initialize(bytes calldata data_) external initializer returns (bytes32) {
        tierV2Init();

        CombineTierConfig memory config_ = abi.decode(
            data_,
            (CombineTierConfig)
        );

        // Integrity check for all known combined tiers.
        for (uint256 i_ = 0; i_ < config_.combinedTiersLength; i_++) {
            require(
                ERC165Checker.supportsInterface(
                    address(uint160(config_.evaluableConfig.constants[i_])),
                    type(ITierV2).interfaceId
                ),
                "ERC165_TIERV2"
            );
        }

        emit Initialize(msg.sender, config_);

        (
            IInterpreterV1 interpreter_,
            IInterpreterStoreV1 store_,
            address expression_
        ) = config_.evaluableConfig.deployer.deployExpression(
                config_.evaluableConfig.sources,
                config_.evaluableConfig.constants,
                LibUint256Array.arrayFrom(
                    REPORT_MIN_OUTPUTS,
                    REPORT_FOR_TIER_MIN_OUTPUTS
                )
            );
        evaluable = Evaluable(interpreter_, store_, expression_);

        return ICLONEABLE_V2_SUCCESS;
    }

    /// @inheritdoc ITierV2
    function report(
        address account_,
        uint256[] memory reportContext_
    ) external view virtual override returns (uint256) {
        unchecked {
            Evaluable memory evaluable_ = evaluable;
            (uint256[] memory stack_, ) = evaluable_.interpreter.eval(
                evaluable_.store,
                DEFAULT_STATE_NAMESPACE,
                LibEncodedDispatch.encode(
                    evaluable_.expression,
                    REPORT_ENTRYPOINT,
                    REPORT_MAX_OUTPUTS
                ),
                LibContext.build(
                    LibUint256Matrix.matrixFrom(
                        uint256(uint160(account_)).arrayFrom(),
                        reportContext_
                    ),
                    new SignedContextV1[](0)
                )
            );
            return stack_[stack_.length - 1];
        }
    }

    /// @inheritdoc ITierV2
    function reportTimeForTier(
        address account_,
        uint256 tier_,
        uint256[] memory reportContext_
    ) external view returns (uint256) {
        unchecked {
            Evaluable memory evaluable_ = evaluable;
            (uint256[] memory stack_, ) = evaluable_.interpreter.eval(
                evaluable_.store,
                DEFAULT_STATE_NAMESPACE,
                LibEncodedDispatch.encode(
                    evaluable_.expression,
                    REPORT_FOR_TIER_ENTRYPOINT,
                    REPORT_FOR_TIER_MAX_OUTPUTS
                ),
                LibContext.build(
                    LibUint256Matrix.matrixFrom(
                        LibUint256Array.arrayFrom(
                            uint256(uint160(account_)),
                            tier_
                        ),
                        reportContext_
                    ),
                    new SignedContextV1[](0)
                )
            );
            return stack_[stack_.length - 1];
        }
    }
}
