// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { ERC20Config } from "../erc20/ERC20Config.sol";
import "./IClaim.sol";
import "../tier/ReadOnlyTier.sol";
import { RainVM, Stack, Op, Ops as RainVMOps } from "../vm/RainVM.sol";
import "../vm/ImmutableSource.sol";
import { BlockOps, Ops as BlockOpsOps } from "../vm/ops/BlockOps.sol";
import { ThisOps, Ops as ThisOpsOps } from "../vm/ops/ThisOps.sol";
import { MathOps, Ops as MathOpsOps } from "../vm/ops/MathOps.sol";
import { TierOps, Ops as TierOpsOps } from "../vm/ops/TierOps.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

enum Ops {
    account,
    constructionBlockNumber
}

struct EmissionsERC20Config {
    bool allowDelegatedClaims;
    ERC20Config erc20Config;
    Source source;
}

contract EmissionsERC20 is
    ERC20,
    IClaim,
    ReadOnlyTier,
    RainVM,
    ImmutableSource
{
    bool public immutable allowDelegatedClaims;
    uint8 public immutable blockOpsStart;
    uint8 public immutable thisOpsStart;
    uint8 public immutable mathOpsStart;
    uint8 public immutable tierOpsStart;
    uint8 public immutable emissionsOpsStart;
    /// Block this contract was constructed.
    /// Can be used to calculate claim entitlements relative to the deployment
    /// of the emissions contract itself.
    uint32 public immutable constructionBlockNumber;

    /// Each claim is modelled as a report so that the claim report can be
    /// diffed against the upstream report from a tier based emission scheme.
    mapping(address => uint256) public reports;

    constructor(EmissionsERC20Config memory config_)
        ImmutableSource(config_.source)
        ERC20(config_.erc20Config.name, config_.erc20Config.symbol)
    {
        blockOpsStart = uint8(RainVMOps.length);
        thisOpsStart = blockOpsStart + uint8(BlockOpsOps.length);
        mathOpsStart = thisOpsStart + uint8(ThisOpsOps.length);
        tierOpsStart = mathOpsStart + uint8(MathOpsOps.length);
        emissionsOpsStart = tierOpsStart + uint8(TierOpsOps.length);

        allowDelegatedClaims = config_.allowDelegatedClaims;

        constructionBlockNumber = uint32(block.number);
    }

    function applyOp(
        bytes memory context_,
        Stack memory stack_,
        Op memory op_
    )
        internal
        override
        view
    {
        if (op_.code < thisOpsStart) {
            op_.code -= blockOpsStart;
            BlockOps.applyOp(
                context_,
                stack_,
                op_
            );
        }
        else if (op_.code < mathOpsStart) {
            op_.code -= thisOpsStart;
            ThisOps.applyOp(
                context_,
                stack_,
                op_
            );
        }
        else if (op_.code < tierOpsStart) {
            op_.code -= mathOpsStart;
            MathOps.applyOp(
                context_,
                stack_,
                op_
            );
        }
        else if (op_.code < emissionsOpsStart) {
            op_.code -= tierOpsStart;
            TierOps.applyOp(
                context_,
                stack_,
                op_
            );
        }
        else {
            op_.code -= emissionsOpsStart;
            if (op_.code == uint8(Ops.account)) {
                (address account_) = abi.decode(context_, (address));
                stack_.vals[stack_.index] = uint256(uint160(account_));
                stack_.index++;
            }
            else if (op_.code == uint8(Ops.constructionBlockNumber)) {
                stack_.vals[stack_.index] = constructionBlockNumber;
                stack_.index++;
            }
        }
    }

    /// @inheritdoc ITier
    function report(address account_)
        public
        virtual
        override
        view
        returns (uint256)
    {
        // Fallback to 0 is correct in this case as a user who never claimed
        // is ALWAYS able to claim.
        return reports[account_];
    }

    function calculateClaim(address account_)
        public
        view
        returns (uint256)
    {
        Stack memory stack_;
        eval(
            abi.encode(account_),
            source(),
            stack_
        );
        return stack_.vals[stack_.index - 1];
    }

    function claim(address account_, bytes memory data_) external {
        // Disallow delegated claims if appropriate.
        if (!allowDelegatedClaims) {
            require(msg.sender == account_, "DELEGATED_CLAIM");
        }

        // Mint the claim.
        uint256 amount_ = calculateClaim(account_);
        _mint(
            account_,
            amount_
        );

        // Record the current block as the latest claim.
        // This can be diffed/combined with external reports in future claim
        // calculations.
        reports[account_] = TierReport.updateBlocksForTierRange(
            0,
            Tier.ZERO,
            Tier.EIGHT,
            uint32(block.number)
        );

        // Notify the world of the claim.
        emit Claim(
            account_,
            data_
        );
    }

}