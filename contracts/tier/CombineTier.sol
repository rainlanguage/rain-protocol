// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../interpreter/runtime/StandardInterpreter.sol";
import {AllStandardOps} from "../interpreter/ops/AllStandardOps.sol";
import {TierwiseCombine} from "./libraries/TierwiseCombine.sol";
import {ITierV2} from "./ITierV2.sol";
import {TierV2} from "./TierV2.sol";
import "../interpreter/integrity/RainInterpreterIntegrity.sol";

import {ERC165CheckerUpgradeable as ERC165Checker} from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165CheckerUpgradeable.sol";

SourceIndex constant REPORT_ENTRYPOINT = SourceIndex.wrap(0);
SourceIndex constant REPORT_FOR_TIER_ENTRYPOINT = SourceIndex.wrap(1);
uint256 constant MIN_FINAL_STACK_INDEX = 1;

/// All config used during initialization of a CombineTier.
/// @param combinedTiersLength The first N values in the constants array of the
/// sourceConfig MUST be all the combined tiers that are known statically. Of
/// course some tier addresses MAY only be known at runtime and so these cannot
/// be included. For those that are included there will be additional deploy
/// time checks to ensure compatibility with each other (i.e. reportUnits).
/// @param sourceConfig Source to run for both report and reportForTier as
/// sources 0 and 1 respectively.
struct CombineTierConfig {
    uint256 combinedTiersLength;
    StateConfig sourceConfig;
}

/// @title CombineTier
/// @notice Allows combining the reports from any `ITierV2` contracts.
/// The value at the top of the stack after executing the Rain expression will be
/// used as the return of all `ITierV2` functions exposed by `CombineTier`.
contract CombineTier is TierV2, StandardInterpreter {
    using LibStackTop for StackTop;
    using LibStackTop for uint256[];
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];
    using LibInterpreterState for InterpreterState;

    event Initialize(address sender, CombineTierConfig config);

    constructor(address interpreterIntegrity_)
        StandardInterpreter(interpreterIntegrity_)
    {
        _disableInitializers();
    }

    function initialize(CombineTierConfig calldata config_)
        external
        initializer
    {
        __TierV2_init();
        _saveInterpreterState(
            config_.sourceConfig,
            LibUint256Array.arrayFrom(
                MIN_FINAL_STACK_INDEX,
                MIN_FINAL_STACK_INDEX
            )
        );

        // Integrity check for all known combined tiers.
        for (uint256 i_ = 0; i_ < config_.combinedTiersLength; i_++) {
            require(
                ERC165Checker.supportsInterface(
                    address(uint160(config_.sourceConfig.constants[i_])),
                    type(ITierV2).interfaceId
                ),
                "ERC165_TIERV2"
            );
        }

        emit Initialize(msg.sender, config_);
    }

    /// @inheritdoc ITierV2
    function report(address account_, uint256[] memory context_)
        external
        view
        virtual
        override
        returns (uint256)
    {
        return
            _loadInterpreterState(
                uint256(uint160(account_)).arrayFrom(context_)
            ).eval(REPORT_ENTRYPOINT).peek();
    }

    /// @inheritdoc ITierV2
    function reportTimeForTier(
        address account_,
        uint256 tier_,
        uint256[] memory context_
    ) external view returns (uint256) {
        return
            _loadInterpreterState(
                LibUint256Array.arrayFrom(
                    uint256(uint160(account_)),
                    tier_,
                    context_
                )
            ).eval(REPORT_FOR_TIER_ENTRYPOINT).peek();
    }
}
