// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import "../vm/RainVM.sol";
// solhint-disable-next-line max-line-length
import {AllStandardOps} from "../vm/ops/AllStandardOps.sol";
import {TierwiseCombine} from "./libraries/TierwiseCombine.sol";
import {ITierV2} from "./ITierV2.sol";
import {TierV2} from "./TierV2.sol";
import "../vm/VMStateBuilder.sol";

import "@openzeppelin/contracts/utils/introspection/ERC165Checker.sol";

uint256 constant REPORT_ENTRYPOINT = 0;
uint256 constant REPORT_FOR_TIER_ENTRYPOINT = 1;
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
/// @notice Implements `ReadOnlyTier` over RainVM. Allows combining the reports
/// from any other `ITierV2` contracts referenced in the `ImmutableSource` set
/// at construction.
/// The value at the top of the stack after executing the rain script will be
/// used as the return of `report`.
contract CombineTier is TierV2, RainVM, Initializable {
    event Initialize(address sender, CombineTierConfig config);

    // This allows cloned contracts to forward the template contract to the VM
    // state builder during initialization.
    address private immutable self;
    address private immutable vmStateBuilder;
    address private vmStatePointer;

    constructor(address vmStateBuilder_) {
        self = address(this);
        vmStateBuilder = vmStateBuilder_;
    }

    function initialize(CombineTierConfig calldata config_)
        external
        initializer
    {
        Bounds memory reportBounds_;
        reportBounds_.entrypoint = REPORT_ENTRYPOINT;
        reportBounds_.minFinalStackIndex = MIN_FINAL_STACK_INDEX;
        Bounds memory reportForTierBounds_;
        reportForTierBounds_.entrypoint = REPORT_FOR_TIER_ENTRYPOINT;
        reportForTierBounds_.minFinalStackIndex = MIN_FINAL_STACK_INDEX;
        Bounds[] memory boundss_ = new Bounds[](2);
        boundss_[0] = reportBounds_;
        boundss_[1] = reportForTierBounds_;
        bytes memory stateBytes_ = VMStateBuilder(vmStateBuilder).buildState(
            self,
            config_.sourceConfig,
            boundss_
        );
        vmStatePointer = SSTORE2.write(stateBytes_);

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

    function fnPtrs() public pure override returns (bytes memory) {
        return AllStandardOps.fnPtrs();
    }

    /// @inheritdoc ITierV2
    function report(address account_, uint[] memory context_)
        external
        view
        virtual
        override
        returns (uint256 report_)
    {
        State memory state_ = LibState.fromBytesPacked(
            SSTORE2.read(vmStatePointer)
        );
        bytes memory evalContext_ = bytes.concat(
            bytes32(uint256(uint160(account_))),
            abi.encodePacked(context_)
        );
        eval(evalContext_, state_, REPORT_ENTRYPOINT);
        report_ = state_.stack[state_.stackIndex - 1];
    }

    /// @inheritdoc ITierV2
    function reportTimeForTier(
        address account_,
        uint256 tier_,
        uint[] calldata context_
    ) external view returns (uint256 time_) {
        State memory state_ = LibState.fromBytesPacked(
            SSTORE2.read(vmStatePointer)
        );
        bytes memory evalContext_ = bytes.concat(
            bytes32(uint256(uint160(account_))),
            bytes32(tier_),
            abi.encodePacked(context_)
        );
        eval(evalContext_, state_, REPORT_FOR_TIER_ENTRYPOINT);
        time_ = state_.stack[state_.stackIndex - 1];
    }
}
