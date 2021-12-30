// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { ERC20Config } from "../erc20/ERC20Config.sol";
import "./IClaim.sol";
import "../tier/ReadOnlyTier.sol";
import { RainVM, State, Op } from "../vm/RainVM.sol";
import "../vm/ImmutableSource.sol";
import { BlockOps } from "../vm/ops/BlockOps.sol";
import { ThisOps } from "../vm/ops/ThisOps.sol";
import { MathOps } from "../vm/ops/MathOps.sol";
import { TierOps } from "../vm/ops/TierOps.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// Constructor config.
struct EmissionsERC20Config {
    /// True if accounts can call `claim` on behalf of another account.
    bool allowDelegatedClaims;
    /// Constructor config for the ERC20 token minted according to emissions
    /// schedule in `claim`.
    ERC20Config erc20Config;
    /// Constructor config for the `ImmutableSource` that defines the emissions
    /// schedule for claiming.
    ImmutableSourceConfig immutableSourceConfig;
}

/// @title EmissionsERC20
/// @notice Mints itself according to some predefined schedule. The schedule is
/// expressed as a rainVM script and the `claim` function is world-callable.
/// Intended behaviour is to avoid sybils infinitely minting by putting the
/// claim functionality behind a `Tier` contract. The emissions contract itself
/// implements `ReadOnlyTier` and every time a claim is processed it logs the
/// block number of the claim against every tier claimed. So the block numbers
/// in the tier report for `EmissionsERC20` are the last time that tier was
/// claimed against this contract. The simplest way to make use of this
/// information is to take the max block for the underlying tier and the last
/// claim and then diff it against the current block number.
/// See `test/Claim/EmissionsERC20.sol.ts` for examples, including providing
/// staggered rewards where more tokens are minted for higher tier accounts.
contract EmissionsERC20 is
    ERC20,
    IClaim,
    ReadOnlyTier,
    RainVM,
    ImmutableSource
{
    /// @dev local opcode to put claimant account on the stack.
    uint internal constant CLAIMANT_ACCOUNT = 0;
    /// @dev local opcode to put this contract's deploy block on the stack.
    uint internal constant CONSTRUCTION_BLOCK_NUMBER = 1;

    /// @dev local offset for block ops.
    uint internal immutable blockOpsStart;
    /// @dev local offest for this ops.
    uint internal immutable thisOpsStart;
    /// @dev local offset for math ops.
    uint internal immutable mathOpsStart;
    /// @dev local offset for tier ops.
    uint internal immutable tierOpsStart;
    /// @dev local offset for emissions ops.
    uint internal immutable emissionsOpsStart;
    /// @dev Block this contract was constructed.
    /// Can be used to calculate claim entitlements relative to the deployment
    /// of the emissions contract itself.
    /// This is internal to `EmissionsERC20` but is available via a local
    /// opcode, and so can be used in rainVM scripts.
    uint internal immutable constructionBlockNumber;

    /// Whether the claimant must be the caller of `claim`. If `false` then
    /// accounts other than claimant can claim. This may or may not be
    /// desirable depending on the emissions schedule. For example, a linear
    /// schedule will produce the same end result for the claimant regardless
    /// of who calls `claim` or when but an exponential schedule is more
    /// profitable if the claimant waits longer between claims. In the
    /// non-linear case delegated claims would be inappropriate as third
    /// party accounts could grief claimants by claiming "early", thus forcing
    /// opportunity cost on claimants who would have preferred to wait.
    bool public immutable allowDelegatedClaims;

    /// Each claim is modelled as a report so that the claim report can be
    /// diffed against the upstream report from a tier based emission scheme.
    mapping(address => uint) public reports;

    /// Constructs the emissions schedule source, opcodes and ERC20 to mint.
    /// @param config_ source and token config. Also controls delegated claims.
    constructor(EmissionsERC20Config memory config_)
        ImmutableSource(config_.immutableSourceConfig)
        ERC20(config_.erc20Config.name, config_.erc20Config.symbol)
    {
        /// These local opcode offsets are calculated as immutable but are
        /// really just compile time constants. They only depend on the
        /// imported libraries and contracts. These are calculated at
        /// construction to future-proof against underlying ops being
        /// added/removed and potentially breaking the offsets here.
        blockOpsStart = RainVM.OPS_LENGTH;
        thisOpsStart = blockOpsStart + BlockOps.OPS_LENGTH;
        mathOpsStart = thisOpsStart + ThisOps.OPS_LENGTH;
        tierOpsStart = mathOpsStart + MathOps.OPS_LENGTH;
        emissionsOpsStart = tierOpsStart + TierOps.OPS_LENGTH;

        /// Log some deploy state for use by claim/opcodes.
        allowDelegatedClaims = config_.allowDelegatedClaims;
        constructionBlockNumber = block.number;
    }

    /// @inheritdoc RainVM
    function applyOp(
        bytes memory context_,
        State memory state_,
        Op memory op_
    )
        internal
        override
        view
    {
        unchecked {
            if (op_.code < thisOpsStart) {
                op_.code -= blockOpsStart;
                BlockOps.applyOp(
                    context_,
                    state_,
                    op_
                );
            }
            else if (op_.code < mathOpsStart) {
                op_.code -= thisOpsStart;
                ThisOps.applyOp(
                    context_,
                    state_,
                    op_
                );
            }
            else if (op_.code < tierOpsStart) {
                op_.code -= mathOpsStart;
                MathOps.applyOp(
                    context_,
                    state_,
                    op_
                );
            }
            else if (op_.code < emissionsOpsStart) {
                op_.code -= tierOpsStart;
                TierOps.applyOp(
                    context_,
                    state_,
                    op_
                );
            }
            else {
                op_.code -= emissionsOpsStart;
                if (op_.code == CLAIMANT_ACCOUNT) {
                    (address account_) = abi.decode(context_, (address));
                    state_.stack[state_.stackIndex]
                    = uint256(uint160(account_));
                    state_.stackIndex++;
                }
                else if (op_.code == CONSTRUCTION_BLOCK_NUMBER) {
                    state_.stack[state_.stackIndex] = constructionBlockNumber;
                    state_.stackIndex++;
                }
            }
        }
    }

    /// @inheritdoc ITier
    function report(address account_)
        public
        virtual
        override
        view
        returns (uint)
    {
        return reports[account_] > 0 ? reports[account_] : TierReport.NEVER;
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
    function calculateClaim(address claimant_)
        public
        view
        returns (uint)
    {
        State memory state_ = newState();
        eval(
            abi.encode(claimant_),
            state_,
            0
        );
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
    function claim(address claimant_, bytes memory data_) external {
        // Disallow delegated claims if appropriate.
        if (!allowDelegatedClaims) {
            require(msg.sender == claimant_, "DELEGATED_CLAIM");
        }

        // Mint the claim.
        uint amount_ = calculateClaim(claimant_);
        _mint(claimant_, amount_);

        // Record the current block as the latest claim.
        // This can be diffed/combined with external reports in future claim
        // calculations.
        reports[claimant_] = TierReport.updateBlocksForTierRange(
            0,
            0,
            8,
            block.number
        );

        // Notify the world of the claim.
        emit Claim(claimant_, data_);
    }

}