// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol" as ERC20;
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// solhint-disable-next-line max-line-length
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { Tier, ITier } from "../tier/ITier.sol";

import { Phase } from "../phased/Phased.sol";
// solhint-disable-next-line max-line-length
import { RedeemableERC20, RedeemableERC20Config } from "../redeemableERC20/RedeemableERC20.sol";
// solhint-disable-next-line max-line-length
import { RedeemableERC20Pool, CRPConfig } from "../pool/RedeemableERC20Pool.sol";
import { SeedERC20, SeedERC20Config } from "../seed/SeedERC20.sol";
// solhint-disable-next-line max-line-length
import { RedeemableERC20Factory } from "../redeemableERC20/RedeemableERC20Factory.sol";
import { SeedERC20Factory } from "../seed/SeedERC20Factory.sol";
import { BPoolFeeEscrow } from "../escrow/BPoolFeeEscrow.sol";
import { ERC20Config } from "../erc20/ERC20Config.sol";
import { Phase, Phased } from "../phased/Phased.sol";

// solhint-disable-next-line max-line-length
import { PoolParams, IConfigurableRightsPool } from "../pool/IConfigurableRightsPool.sol";

/// Summary of every contract built or referenced internally by `Trust`.
struct TrustContracts {
    // Reserve erc20 token used to provide value to the created Balancer pool.
    address reserveERC20;
    // Redeemable erc20 token that is minted and distributed.
    address redeemableERC20;
    // Contract that builds, starts and exits the balancer pool.
    address redeemableERC20Pool;
    // Address that provides the initial reserve token seed.
    address seeder;
    // Address that defines and controls tier levels for users.
    address tier;
    // The Balancer `ConfigurableRightsPool` deployed for this distribution.
    address crp;
    // The Balancer pool that holds and trades tokens during the distribution.
    address pool;
}

/// High level state of the distribution.
/// An amalgamation of the phases and states of the internal contracts.
enum DistributionStatus {
    // Trust is created but does not have reserve funds required to start the
    // distribution.
    Pending,
    // Trust has enough reserve funds to start the distribution.
    Seeded,
    // The balancer pool is funded and trading.
    Trading,
    // The last block of the balancer pool gradual weight changes is in the
    // past.
    TradingCanEnd,
    // The balancer pool liquidity has been removed and distribution is
    // successful.
    Success,
    // The balancer pool liquidity has been removed and distribution is a
    // failure.
    Fail
}

/// High level stats of the current state of the distribution.
/// Includes the `DistributionStatus` and key configuration and metrics.
struct DistributionProgress {
    // `DistributionStatus` as above.
    DistributionStatus distributionStatus;
    // First block that the distribution can be traded.
    // Will be `-1` before trading.
    uint32 distributionStartBlock;
    // First block that the distribution can be ended.
    // Will be `-1` before trading.
    uint32 distributionEndBlock;
    // Current reserve balance in the Balancer pool.
    // Will be `0` before trading.
    // Will be the exit dust after trading.
    uint256 poolReserveBalance;
    // Current token balance in the Balancer pool.
    // Will be `0` before trading.
    // Will be `0` after distribution due to burn.
    uint256 poolTokenBalance;
    // Initial reserve used to build the Balancer pool.
    uint256 reserveInit;
    // Minimum creator reserve value for the distribution to succeed.
    uint256 minimumCreatorRaise;
    // Seeder fee paid in reserve if the distribution is a success.
    uint256 seederFee;
    // Initial reserve value forwarded to minted redeemable tokens on success.
    uint256 redeemInit;
}

/// Configuration specific to constructing the `Trust`.
/// `Trust` contracts also take inner config for the pool and token.
struct TrustConfig {
    BPoolFeeEscrow bPoolFeeEscrow;
    address crpFactory;
    address balancerFactory;
    IERC20 reserve;
    uint256 reserveInit;
    uint256 initialValuation;
    uint256 finalValuation;
    uint256 minimumTradingDuration;
    // Address of the creator who will receive reserve assets on successful
    // distribution.
    address creator;
    uint32 creatorFundsReleaseTimeout;
    // Minimum amount to raise for the creator from the distribution period.
    // A successful distribution raises at least this AND also the seed fee and
    // `redeemInit`;
    // On success the creator receives these funds.
    // On failure the creator receives `0`.
    uint256 minimumCreatorRaise;
    uint256 seederFee;
    uint256 redeemInit;
}

struct TrustSeedERC20Config {
    // The `SeedERC20Factory` on the current network.
    SeedERC20Factory seedERC20Factory;
    // Either an EOA (externally owned address) or `address(0)`.
    // If an EOA the seeder account must transfer seed funds to the newly
    // constructed `Trust` before distribution can start.
    // If `address(0)` a new `SeedERC20` contract is built in the `Trust`
    // constructor.
    address seeder;
    // Total seed units to be mint and sold.
    // 100% of all seed units must be sold for seeding to complete.
    // Recommended to keep seed units to a small value (single-triple digits).
    // The ability for users to buy/sell or not buy/sell dust seed quantities
    // is likely NOT desired.
    uint16 seederUnits;
    // Cooldown duration in blocks for seed/unseed cycles.
    // Seeding requires locking funds for at least the cooldown period.
    // Ideally `unseed` is never called and `seed` leaves funds in the contract
    // until all seed tokens are sold out.
    // A failed raise cannot make funds unrecoverable, so `unseed` does exist,
    // but it should be called rarely.
    uint16 seederCooldownDuration;
    // ERC20Config forwarded to the seedERC20.
    ERC20Config seedERC20Config;
}

struct TrustRedeemableERC20Config {
    // The `RedeemableERC20Factory` on the current network.
    RedeemableERC20Factory redeemableERC20Factory;
    // ERC20Config forwarded to redeemableERC20 constructor.
    ERC20Config erc20Config;
    // `ITier` contract to compare statuses against on transfer.
    ITier tier;
    // Minimum status required for transfers in `Phase.ZERO`. Can be `0`.
    Tier minimumStatus;
    // Number of redeemable tokens to mint.
    uint256 totalSupply;
}

/// @title Trust
/// @notice Coordinates the mediation and distribution of tokens
/// between stakeholders.
///
/// The `Trust` contract is responsible for configuring the
/// `RedeemableERC20` token, `RedeemableERC20Pool` Balancer wrapper
/// and the `SeedERC20` contract.
///
/// Internally the `TrustFactory` calls several admin/owner only
/// functions on its children and these may impose additional
/// restrictions such as `Phased` limits.
///
/// The `Trust` builds and references `RedeemableERC20`,
/// `RedeemableERC20Pool` and `SeedERC20` contracts internally and
/// manages all access-control functionality.
///
/// The major functions of the `Trust` contract, apart from building
/// and configuring the other contracts, is to start and end the
/// fundraising event, and mediate the distribution of funds to the
/// correct stakeholders:
///
/// - On `Trust` construction, all minted `RedeemableERC20` tokens
///   are sent to the `RedeemableERC20Pool`
/// - `startDutchAuction` can be called by anyone on `RedeemableERC20Pool` to
///   begin the Dutch Auction. This will revert if this is called before seeder
///   reserve funds are available on the `Trust`.
/// - `anonEndDistribution` can be called by anyone (only when
///   `RedeemableERC20Pool` is in `Phase.TWO`) to end the Dutch Auction
///   and distribute funds to the correct stakeholders, depending on
///   whether or not the auction met the fundraising target.
///   - On successful raise
///     - seed funds are returned to `seeder` address along with
///       additional `seederFee` if configured
///     - `redeemInit` is sent to the `redeemableERC20` address, to back
///       redemptions
///     - the `creator` gets the remaining balance, which should
///       equal or exceed `minimumCreatorRaise`
///   - On failed raise
///     - seed funds are returned to `seeder` address
///     - the remaining balance is sent to the `redeemableERC20` address, to
///       back redemptions
///     - the `creator` gets nothing
/// @dev Mediates stakeholders and creates internal Balancer pools and tokens
/// for a distribution.
///
/// The goals of a distribution:
/// - Mint and distribute a `RedeemableERC20` as fairly as possible,
///   prioritising true fans of a creator.
/// - Raise a minimum reserve so that a creator can deliver value to fans.
/// - Provide a safe space through membership style filters to enhance
///   exclusivity for fans.
/// - Ensure that anyone who seeds the raise (not fans) by risking and
///   providing capital is compensated.
///
/// Stakeholders:
/// - Creator: Have a project of interest to their fans
/// - Fans: Will purchase project-specific tokens to receive future rewards
///   from the creator
/// - Seeder(s): Provide initial reserve assets to seed a Balancer trading pool
/// - Deployer: Configures and deploys the `Trust` contract
///
/// The creator is nominated to receive reserve assets on a successful
/// distribution. The creator must complete the project and fans receive
/// rewards. There is no on-chain mechanism to hold the creator accountable to
/// the project completion. Requires a high degree of trust between creator and
/// their fans.
///
/// Fans are willing to trust and provide funds to a creator to complete a
/// project. Fans likely expect some kind of reward or "perks" from the
/// creator, such as NFTs, exclusive events, etc.
/// The distributed tokens are untransferable after trading ends and merely act
/// as records for who should receive rewards.
///
/// Seeders add the initial reserve asset to the Balancer pool to start the
/// automated market maker (AMM).
/// Ideally this would not be needed at all.
/// Future versions of `Trust` may include a bespoke distribution mechanism
/// rather than Balancer contracts. Currently it is required by Balancer so the
/// seeder provides some reserve and receives a fee on successful distribution.
/// If the distribution fails the seeder is returned their initial reserve
/// assets. The seeder is expected to promote and mentor the creator in
/// non-financial ways.
///
/// The deployer has no specific priviledge or admin access once the `Trust` is
/// deployed. They provide the configuration, including nominating
/// creator/seeder, and pay gas but that is all.
/// The deployer defines the conditions under which the distribution is
/// successful. The seeder/creator could also act as the deployer.
///
/// Importantly the `Trust` contract is the owner/admin of the contracts it
/// creates. The `Trust` never transfers ownership so it directly controls all
/// internal workflows. No stakeholder, even the deployer or creator, can act
/// as owner of the internals.
contract Trust is Phased {

    using Math for uint256;

    using SafeERC20 for IERC20;
    using SafeERC20 for RedeemableERC20;

    event CreatorFundsRelease(address token, uint256 amount);

    BPoolFeeEscrow public immutable bPoolFeeEscrow;

    /// Anyone can emit a `Notice`.
    /// This is open ended content related to the `Trust`.
    /// Some examples:
    /// - Raise descriptions/promises
    /// - Reviews/comments from token holders
    /// - Simple onchain voting/signalling
    /// GUIs/tooling/indexers reading this data are expected to know how to
    /// interpret it in context because the contract does not.
    /// @param sender The `msg.sender` that emitted the `Notice`.
    /// @param data Opaque binary data for the GUI/tooling/indexer to read.
    event Notice(address indexed sender, bytes data);

    /// Seeder units from the initial config.
    uint16 public immutable seederUnits;
    /// Seeder cooldown duration from the initial config.
    uint16 public immutable seederCooldownDuration;
    /// SeedERC20Factory from the initial config.
    /// Seeder from the initial config.
    address public immutable seeder;
    SeedERC20Factory public immutable seedERC20Factory;
    /// Balance of the reserve asset in the Balance pool at the moment
    /// `anonEndDistribution` is called. This must be greater than or equal to
    /// `successBalance` for the distribution to succeed.
    /// Will be uninitialized until `anonEndDistribution` is called.
    /// Note the finalBalance includes the dust that is permanently locked in
    /// the Balancer pool after the distribution.
    /// The actual distributed amount will lose roughly 10 ** -7 times this as
    /// locked dust.
    /// The exact dust can be retrieved by inspecting the reserve balance of
    /// the Balancer pool after the distribution.
    uint256 public finalBalance;
    /// Pool reserveInit + seederFee + redeemInit + minimumCreatorRaise.
    /// Could be calculated as a view function but that would require external
    /// calls to the pool contract.
    uint256 public immutable successBalance;

    /// The redeemable token minted in the constructor.
    RedeemableERC20 public immutable token;

    /// Reserve token.
    IERC20 public immutable reserve;
    /// Initial reserve balance of the pool.
    uint256 public immutable reserveInit;

    /// The `ConfigurableRightsPool` built during construction.
    IConfigurableRightsPool public immutable crp;

    uint256 public immutable minimumCreatorRaise;

    address public immutable creator;
    uint32 public immutable creatorFundsReleaseTimeout;

    uint256 public immutable seederFee;
    uint256 public immutable redeemInit;

    /// Minimum trading duration from the initial config.
    uint256 public immutable minimumTradingDuration;

    /// The final weight on the last block of the raise.
    /// Note the spot price is unknown until the end because we don't know
    /// either of the final token balances.
    uint256 public immutable finalWeight;
    uint256 public immutable finalValuation;

    /// Sanity checks configuration.
    /// Creates the `RedeemableERC20` contract and mints the redeemable ERC20
    /// token.
    /// Creates the `RedeemableERC20Pool` contract.
    /// (optional) Creates the `SeedERC20` contract. Pass a non-zero address to
    /// bypass this.
    /// Adds the Balancer pool contracts to the token sender/receiver lists as
    /// needed.
    /// Adds the Balancer pool reserve asset as the first redeemable on the
    /// `RedeemableERC20` contract.
    ///
    /// Note on slither:
    /// Slither detects a benign reentrancy in this constructor.
    /// However reentrancy is not possible in a contract constructor.
    /// Further discussion with the slither team:
    /// https://github.com/crytic/slither/issues/887
    ///
    /// @param config_ Config for the Trust.
    // Slither false positive. Constructors cannot be reentrant.
    // https://github.com/crytic/slither/issues/887
    // slither-disable-next-line reentrancy-benign
    constructor (
        TrustConfig memory config_,
        TrustRedeemableERC20Config memory trustRedeemableERC20Config_,
        TrustSeedERC20Config memory trustSeedERC20Config_
    ) {
        // There are additional minimum reserve init and token supply
        // restrictions enforced by `RedeemableERC20` and
        // `RedeemableERC20Pool`. This ensures that the weightings and
        // valuations will be in a sensible range according to the internal
        // assumptions made by Balancer etc.
        require(
            trustRedeemableERC20Config_.totalSupply
            >= config_.reserveInit,
            "MIN_TOKEN_SUPPLY"
        );

        seederUnits = trustSeedERC20Config_.seederUnits;
        seederCooldownDuration = trustSeedERC20Config_.seederCooldownDuration;
        seedERC20Factory = trustSeedERC20Config_.seedERC20Factory;

        creator = config_.creator;
        creatorFundsReleaseTimeout = config_.creatorFundsReleaseTimeout;
        reserve = config_.reserve;
        reserveInit = config_.reserveInit;
        minimumCreatorRaise = config_.minimumCreatorRaise;
        seederFee = config_.seederFee;
        redeemInit = config_.redeemInit;
        bPoolFeeEscrow = config_.bPoolFeeEscrow;

        RedeemableERC20 redeemableERC20_ = RedeemableERC20(
            trustRedeemableERC20Config_.redeemableERC20Factory
                .createChild(abi.encode(
                    RedeemableERC20Config(
                        address(this),
                        trustRedeemableERC20Config_.erc20Config,
                        trustRedeemableERC20Config_.tier,
                        trustRedeemableERC20Config_.minimumStatus,
                        trustRedeemableERC20Config_.totalSupply
        ))));

        token = redeemableERC20_;

        if (trustSeedERC20Config_.seeder == address(0)) {
            require(
                0 == config_.reserveInit
                    % trustSeedERC20Config_.seederUnits,
                "SEED_PRICE_MULTIPLIER"
            );
            trustSeedERC20Config_.seeder = address(trustSeedERC20Config_
                .seedERC20Factory
                .createChild(abi.encode(SeedERC20Config(
                    config_.reserve,
                    address(this),
                    // seed price.
                    config_.reserveInit / trustSeedERC20Config_.seederUnits,
                    trustSeedERC20Config_.seederUnits,
                    trustSeedERC20Config_.seederCooldownDuration,
                    trustSeedERC20Config_.seedERC20Config
                )))
            );
        }
        seeder = trustSeedERC20Config_.seeder;

        require(
            config_.reserveInit >= RedeemableERC20Pool.MIN_RESERVE_INIT,
            "RESERVE_INIT_MINIMUM"
        );
        require(
            config_.initialValuation >= config_.finalValuation,
            "MIN_INITIAL_VALUTION"
        );
        require(config_.creator != address(0), "CREATOR_0");

        uint256 successBalance_ = config_.reserveInit
            + config_.seederFee
            + config_.redeemInit
            + config_.minimumCreatorRaise;

        finalWeight = RedeemableERC20Pool.valuationWeight(
            config_.reserveInit,
            config_.finalValuation
        );
        finalValuation = config_.finalValuation;

        require(
            finalValuation >= successBalance_,
            "MIN_FINAL_VALUATION"
        );
        successBalance = successBalance_;

        require(config_.minimumTradingDuration > 0, "0_TRADING_DURATION");
        minimumTradingDuration = config_.minimumTradingDuration;

        IConfigurableRightsPool crp_ = RedeemableERC20Pool
            .setupCRP(
                this,
                CRPConfig(
                    config_.crpFactory,
                    config_.balancerFactory,
                    config_.reserve,
                    redeemableERC20_,
                    config_.reserveInit,
                    config_.initialValuation
                )
            );
        redeemableERC20_.grantReceiver(
            address(bPoolFeeEscrow)
        );

        // The pool reserve must always be one of the treasury assets.
        redeemableERC20_.newTreasuryAsset(
            address(config_.reserve)
        );

        crp = crp_;
    }

    /// Accessor for the `TrustContracts` of this `Trust`.
    function getContracts() external view returns(TrustContracts memory) {
        return TrustContracts(
            address(reserve),
            address(token),
            address(this),
            address(seeder),
            address(token.tierContract()),
            address(crp),
            address(crp.bPool())
        );
    }

    /// Accessor for the `DistributionProgress` of this `Trust`.
    function getDistributionProgress()
        external
        view
        returns(DistributionProgress memory)
    {
        return RedeemableERC20Pool.getDistributionProgress(this);
    }

    /// Accessor for the `DistributionStatus` of this `Trust`.
    function getDistributionStatus()
        external
        view
        returns (DistributionStatus)
    {
        return RedeemableERC20Pool.getDistributionStatus(this);
    }

    /// Anyone can send a notice about this `Trust`.
    /// The notice is opaque bytes that the indexer/GUI is expected to
    /// understand the context to decode/interpret it.
    /// @param data_ The data associated with this notice.
    function sendNotice(bytes memory data_) external {
        emit Notice(msg.sender, data_);
    }

    function setFinalBalance(uint finalBalance_) external {
        // Library access only.
        assert(msg.sender == address(this));
        finalBalance = finalBalance_;
    }

    function startDutchAuction() external onlyPhase(Phase.ZERO) {
        uint256 finalAuctionBlock_
            = minimumTradingDuration + block.number;
        // Move to `Phase.ONE` immediately.
        scheduleNextPhase(uint32(block.number));
        // Schedule `Phase.TWO` for `1` block after auctions weights have
        // stopped changing.
        scheduleNextPhase(uint32(finalAuctionBlock_ + 1));
        RedeemableERC20Pool.startDutchAuction(this, finalAuctionBlock_);
    }

    function endDutchAuction() public onlyPhase(Phase.TWO) {
        // Move to `Phase.THREE` immediately.
        // Prevents reentrancy.
        scheduleNextPhase(uint32(block.number));
        RedeemableERC20Pool.endDutchAuction(this);
    }

    /// After `endDutchAuction` has been called this function will sweep all
    /// the approvals atomically. This MAY fail if there is some bug or reason
    /// ANY of the transfers can't succeed. In that case each transfer should
    /// be attempted by each entity unatomically. This is provided as a public
    /// function as anyone can call `endDutchAuction` even if the transfers
    /// WILL succeed, so in that case it is best to process them all together
    /// as a single transaction.
    function transferApprovedTokens() public {
        RedeemableERC20Pool.transferApprovedTokens(this);
    }

    /// Atomically calls `endDutchAuction` and `transferApprovedTokens`.
    /// This should be the defacto approach to end the auction as it performs
    /// all necessary steps to clear funds in a single transaction. However it
    /// MAY fail if there is some bug or reason ANY of the transfers can't
    /// succeed. In that case it is better to call `endDutchAuction` to merely
    /// approve funds and then let each entity attempt to withdraw tokens for
    /// themselves unatomically.
    function endDutchAuctionAndTransfer() public {
        endDutchAuction();
        transferApprovedTokens();
    }

    /// `endDutchAuction` is apparently critically failing.
    /// Move to Phase.FOUR immediately.
    /// This can ONLY be done when the contract has been in the current phase
    /// for at least `creatorFundsReleaseTimeout` blocks.
    /// Either it did not run at all, or somehow it failed to grant access
    /// to funds.
    function enableCreatorFundsRelease() external {
        Phase startPhase_ = currentPhase();
        /// Phase.ZERO unsupported:
        /// How to back out of the pre-seed stage??
        /// Someone sent reserve but not enough to start the auction, and
        /// auction will never start?
        /// Phase.ONE unsupported:
        /// We're mid-distribution, creator will need to wait.
        require(startPhase_ > Phase.ONE, "UNSUPPORTED_FUNDS_RELEASE");
        require(
            blockNumberForPhase(
                phaseBlocks,
                startPhase_
            ) + creatorFundsReleaseTimeout <= block.number,
            "EARLY_RELEASE"
        );
        // Move to `Phase.FOUR` immediately.
        scheduleNextPhase(uint32(block.number));
        if (startPhase_ == Phase.TWO) {
            scheduleNextPhase(uint32(block.number));
        }
    }

    function creatorFundsRelease(address token_, uint256 amount_) external {
        emit CreatorFundsRelease(token_, amount_);
        RedeemableERC20Pool.creatorFundsRelease(
            this,
            token_,
            amount_
        );
    }

    /// Enforce `Phase.FOUR` as the last phase.
    /// @inheritdoc Phased
    function _beforeScheduleNextPhase(uint32 nextPhaseBlock_)
        internal
        override
        virtual
    {
        super._beforeScheduleNextPhase(nextPhaseBlock_);
        assert(currentPhase() < Phase.FOUR);
    }
}