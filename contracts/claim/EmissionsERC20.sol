// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../tier/libraries/TierConstants.sol";
import {ERC20Config} from "../erc20/ERC20Config.sol";
import "./IClaim.sol";
import "../tier/ReadOnlyTier.sol";
import {RainVM, State} from "../vm/RainVM.sol";
import {VMState, StateConfig} from "../vm/libraries/VMState.sol";
// solhint-disable-next-line max-line-length
import {AllStandardOps, ALL_STANDARD_OPS_START, ALL_STANDARD_OPS_LENGTH} from "../vm/ops/AllStandardOps.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

/// Constructor config.
/// @param allowDelegatedClaims True if accounts can call `claim` on behalf of
/// another account.
/// @param Constructor config for the ERC20 token minted according to emissions
/// schedule in `claim`.
/// @param Constructor config for the `ImmutableSource` that defines the
/// emissions schedule for claiming.
struct EmissionsERC20Config {
    bool allowDelegatedClaims;
    ERC20Config erc20Config;
    StateConfig vmStateConfig;
}

/// @title EmissionsERC20
/// @notice Mints itself according to some predefined schedule. The schedule is
/// expressed as a rainVM script and the `claim` function is world-callable.
/// Intended behaviour is to avoid sybils infinitely minting by putting the
/// claim functionality behind a `ITier` contract. The emissions contract
/// itself implements `ReadOnlyTier` and every time a claim is processed it
/// logs the block number of the claim against every tier claimed. So the block
/// numbers in the tier report for `EmissionsERC20` are the last time that tier
/// was claimed against this contract. The simplest way to make use of this
/// information is to take the max block for the underlying tier and the last
/// claim and then diff it against the current block number.
/// See `test/Claim/EmissionsERC20.sol.ts` for examples, including providing
/// staggered rewards where more tokens are minted for higher tier accounts.
contract EmissionsERC20 is
    Initializable,
    RainVM,
    VMState,
    ERC20Upgradeable,
    IClaim,
    ReadOnlyTier
{
    /// Contract has initialized.
    /// @param sender `msg.sender` initializing the contract (factory).
    /// @param allowDelegatedClaims True if accounts can call `claim` on behalf
    /// of another account.
    event Initialize(address sender, bool allowDelegatedClaims);

    /// @dev local opcode to put claimant account on the stack.
    uint256 private constant OPCODE_CLAIMANT_ACCOUNT = 0;
    /// @dev local opcodes length.
    uint256 internal constant LOCAL_OPS_LENGTH = 1;

    /// @dev local offset for local ops.
    uint256 private immutable localOpsStart;

    /// Address of the immutable rain script deployed as a `VMState`.
    address private vmStatePointer;

    /// Whether the claimant must be the caller of `claim`. If `false` then
    /// accounts other than claimant can claim. This may or may not be
    /// desirable depending on the emissions schedule. For example, a linear
    /// schedule will produce the same end result for the claimant regardless
    /// of who calls `claim` or when but an exponential schedule is more
    /// profitable if the claimant waits longer between claims. In the
    /// non-linear case delegated claims would be inappropriate as third
    /// party accounts could grief claimants by claiming "early", thus forcing
    /// opportunity cost on claimants who would have preferred to wait.
    bool public allowDelegatedClaims;

    /// Each claim is modelled as a report so that the claim report can be
    /// diffed against the upstream report from a tier based emission scheme.
    mapping(address => uint256) private reports;

    /// Constructs the emissions schedule source, opcodes and ERC20 to mint.
    constructor() {
        localOpsStart = ALL_STANDARD_OPS_START + ALL_STANDARD_OPS_LENGTH;
    }

    /// @param config_ source and token config. Also controls delegated claims.
    function initialize(EmissionsERC20Config memory config_)
        external
        initializer
    {
        __ERC20_init(config_.erc20Config.name, config_.erc20Config.symbol);
        _mint(
            config_.erc20Config.distributor,
            config_.erc20Config.initialSupply
        );

        vmStatePointer = _snapshot(_newState(config_.vmStateConfig));

        /// Log some deploy state for use by claim/opcodes.
        allowDelegatedClaims = config_.allowDelegatedClaims;

        emit Initialize(msg.sender, config_.allowDelegatedClaims);
    }

    /// @inheritdoc RainVM
    function applyOp(
        bytes memory context_,
        State memory state_,
        uint256 opcode_,
        uint256 operand_
    ) internal view override {
        unchecked {
            if (opcode_ < localOpsStart) {
                AllStandardOps.applyOp(
                    state_,
                    opcode_ - ALL_STANDARD_OPS_START,
                    operand_
                );
            } else {
                opcode_ -= localOpsStart;
                require(opcode_ < LOCAL_OPS_LENGTH, "MAX_OPCODE");
                // There's only one opcode, which stacks the account address.
                address account_ = abi.decode(context_, (address));
                state_.stack[state_.stackIndex] = uint256(uint160(account_));
                state_.stackIndex++;
            }
        }
    }

    /// Reports from the claim contract function differently to most tier
    /// contracts. When the report is uninitialized it is `0` NOT `0xFF..`. The
    /// intent is that the claim report is compatible with an "every" selectLte
    /// against tiers that might be gating claims. It's important that we use
    /// every for this check as the underlying tier doing the gating MUST be
    /// respected on every claim even for users that have previously claimed as
    /// they could have lost tiers since their last claim.
    /// The standard "uninitialized is 0xFF.." logic can be simulated in a rain
    /// script as `REPORT(this, account) IF(ISZERO(DUP(0)), never, DUP(0))` if
    /// desired by the deployer (adjusting the DUP index to taste).
    /// @inheritdoc ITier
    function report(address account_)
        public
        view
        virtual
        override
        returns (uint256)
    {
        return reports[account_];
    }

    /// Calculates the claim without processing it.
    /// Read only method that may be useful downstream both onchain and
    /// offchain if a claimant wants to check the claim amount before deciding
    /// whether to process it.
    /// As this is read only there are no checks against delegated claims. It
    /// is possible to return a value from `calculateClaim` and to not be able
    /// to process the claim with `claim` if `msg.sender` is not the
    /// `claimant_`.
    /// @param claimant_ Address to calculate current claim for.
    function calculateClaim(address claimant_) public view returns (uint256) {
        State memory state_ = _restore(vmStatePointer);
        eval(abi.encode(claimant_), state_, 0);
        return state_.stack[state_.stackIndex - 1];
    }

    /// Processes the claim for `claimant_`.
    /// - Enforces `allowDelegatedClaims` if it is `true` so that `msg.sender`
    /// must also be `claimant_`.
    /// - Takes the return from `calculateClaim` and mints for `claimant_`.
    /// - Records the current block as the claim-tier for this contract.
    /// - emits a `Claim` event as per `IClaim`.
    /// @param claimant_ address receiving minted tokens. MUST be `msg.sender`
    /// if `allowDelegatedClaims` is `false`.
    /// @param data_ NOT used onchain. Forwarded to `Claim` event for potential
    /// additional offchain processing.
    /// @inheritdoc IClaim
    function claim(address claimant_, bytes calldata data_) external {
        // Disallow delegated claims if appropriate.
        if (!allowDelegatedClaims) {
            require(msg.sender == claimant_, "DELEGATED_CLAIM");
        }

        // Mint the claim.
        uint256 amount_ = calculateClaim(claimant_);
        _mint(claimant_, amount_);

        // Record the current block as the latest claim.
        // This can be diffed/combined with external reports in future claim
        // calculations.
        reports[claimant_] = TierReport.updateBlocksForTierRange(
            TierConstants.NEVER_REPORT,
            TierConstants.TIER_ZERO,
            TierConstants.TIER_EIGHT,
            block.number
        );
        emit TierChange(
            msg.sender,
            claimant_,
            TierConstants.TIER_ZERO,
            TierConstants.TIER_EIGHT,
            // `data_` is emitted under `Claim`.
            ""
        );
        emit Claim(msg.sender, claimant_, data_);
    }
}
