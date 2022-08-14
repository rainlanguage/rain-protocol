// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import "../vm/runtime/StandardVM.sol";
import {AllStandardOps} from "../vm/ops/AllStandardOps.sol";
import {TierwiseCombine} from "./libraries/TierwiseCombine.sol";
import {ITierV2} from "./ITierV2.sol";
import {TierV2} from "./TierV2.sol";
import "../vm/integrity/RainVMIntegrity.sol";

import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

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
/// The value at the top of the stack after executing the rain script will be
/// used as the return of all `ITierV2` functions exposed by `CombineTier`.
contract CombineTier is TierV2, StandardVM, Initializable {
    using LibStackTop for StackTop;
    using LibStackTop for uint256[];
    using LibUint256Array for uint256;
    using LibUint256Array for uint256[];

    event Initialize(address sender, CombineTierConfig config);

    constructor(address vmIntegrity_) StandardVM(vmIntegrity_) {
        _disableInitializers();
    }

    function initialize(CombineTierConfig calldata config_)
        external
        initializer
    {
        _saveVMState(
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
        unchecked {
            VMState memory state_ = _loadVMState(
                uint256(uint160(account_)).arrayFrom(context_)
            );
            return eval(state_, REPORT_ENTRYPOINT, state_.stackBottom).peek();
        }
    }

    /// @inheritdoc ITierV2
    function reportTimeForTier(
        address account_,
        uint256 tier_,
        uint256[] memory context_
    ) external view returns (uint256) {
        unchecked {
            VMState memory state_ = _loadVMState(
                LibUint256Array.arrayFrom(
                    uint256(uint160(account_)),
                    tier_,
                    context_
                )
            );
            return
                eval(state_, REPORT_FOR_TIER_ENTRYPOINT, state_.stackBottom)
                    .peek();
        }
    }
}
