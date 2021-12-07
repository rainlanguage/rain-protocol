// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol" as ERC20;
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
// solhint-disable-next-line max-line-length
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// solhint-disable-next-line max-line-length
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ITier } from "../tier/ITier.sol";

import { Phase } from "../phased/Phased.sol";
// solhint-disable-next-line max-line-length
import { RedeemableERC20, RedeemableERC20Config } from "../redeemableERC20/RedeemableERC20.sol";
// solhint-disable-next-line max-line-length
import { RedeemableERC20Pool, RedeemableERC20PoolConfig } from "../pool/RedeemableERC20Pool.sol";
import { SeedERC20, SeedERC20Config } from "../seed/SeedERC20.sol";
// solhint-disable-next-line max-line-length
import { RedeemableERC20Factory } from "../redeemableERC20/RedeemableERC20Factory.sol";
// solhint-disable-next-line max-line-length
import { RedeemableERC20PoolFactory, RedeemableERC20PoolFactoryRedeemableERC20PoolConfig } from "../pool/RedeemableERC20PoolFactory.sol";
import { SeedERC20Factory } from "../seed/SeedERC20Factory.sol";
import { ERC20Config } from "../erc20/ERC20Config.sol";

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
    // Address of the creator who will receive reserve assets on successful
    // distribution.
    address creator;
    // Minimum amount to raise for the creator from the distribution period.
    // A successful distribution raises at least this AND also the seed fee and
    // `redeemInit`;
    // On success the creator receives these funds.
    // On failure the creator receives `0`.
    uint256 minimumCreatorRaise;
    // The `SeedERC20Factory` on the current network.
    SeedERC20Factory seedERC20Factory;
    // Either an EOA (externally owned address) or `address(0)`.
    // If an EOA the seeder account must transfer seed funds to the newly
    // constructed `Trust` before distribution can start.
    // If `address(0)` a new `SeedERC20` contract is built in the `Trust`
    // constructor.
    address seeder;
    // The reserve amount that seeders receive in addition to what they
    // contribute IFF the raise is successful.
    // An absolute value, so percentages etc. must be calculated off-chain and
    // passed in to the constructor.
    uint256 seederFee;
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
    // The amount of reserve to back the redemption initially after trading
    // finishes. Anyone can send more of the reserve to the redemption token at
    // any time to increase redemption value. Successful the redeemInit is sent
    // to token holders, otherwise the failed raise is refunded instead.
    uint256 redeemInit;
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
    ITier.Tier minimumStatus;
    // Number of redeemable tokens to mint.
    uint256 totalSupply;
}

struct TrustRedeemableERC20PoolConfig {
    // The `RedeemableERC20PoolFactory` on the current network.
    RedeemableERC20PoolFactory redeemableERC20PoolFactory;
    // The reserve erc20 token.
    // The reserve token anchors our newly minted redeemable tokens to an
    // existant value system.
    // The weights and balances of the reserve token and the minted token
    // define a dynamic spot price in the AMM.
    IERC20 reserve;
    // Amount of reserve token to initialize the pool.
    // The starting/final weights are calculated against this.
    uint256 reserveInit;
    // Initial marketcap of the token according to the balancer pool
    // denominated in reserve token.
    // Th spot price of the token is ( market cap / token supply ) where market
    // cap is defined in terms of the reserve.
    // The spot price of a balancer pool token is a function of both the
    // amounts of each token and their weights.
    // This bonding curve is described in the balancer whitepaper.
    // We define a valuation of newly minted tokens in terms of the deposited
    // reserve. The reserve weight is set to the minimum allowable value to
    // achieve maximum capital efficiency for the fund raising.
    uint256 initialValuation;
    // Final valuation is treated the same as initial valuation.
    // The final valuation will ONLY be achieved if NO TRADING OCCURS.
    // Any trading activity that net deposits reserve funds into the pool will
    // increase the spot price permanently.
    uint256 finalValuation;
    // Minimum duration IN BLOCKS of the trading on Balancer.
    // The trading does not stop until the `anonEndDistribution` function is
    // called.
    uint256 minimumTradingDuration;
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
contract Trust is ReentrancyGuard {

    using Math for uint256;

    using SafeERC20 for IERC20;
    using SafeERC20 for RedeemableERC20;

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

    /// Creator from the initial config.
    address public immutable creator;
    /// minimum creator raise from the initial config.
    uint256 public immutable minimumCreatorRaise;
    /// Seeder from the initial config.
    address public immutable seeder;
    /// Seeder fee from the initial config.
    uint256 public immutable seederFee;
    /// Seeder units from the initial config.
    uint16 public immutable seederUnits;
    /// Seeder cooldown duration from the initial config.
    uint16 public immutable seederCooldownDuration;
    /// Redeem init from the initial config.
    uint256 public immutable redeemInit;
    /// SeedERC20Factory from the initial config.
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
    /// The `RedeemableERC20Pool` pool created for trading.
    RedeemableERC20Pool public immutable pool;

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
        TrustRedeemableERC20PoolConfig memory trustRedeemableERC20PoolConfig_
    ) {
        require(config_.creator != address(0), "CREATOR_0");
        // There are additional minimum reserve init and token supply
        // restrictions enforced by `RedeemableERC20` and
        // `RedeemableERC20Pool`. This ensures that the weightings and
        // valuations will be in a sensible range according to the internal
        // assumptions made by Balancer etc.
        require(
            trustRedeemableERC20Config_.totalSupply
            >= trustRedeemableERC20PoolConfig_.reserveInit,
            "MIN_TOKEN_SUPPLY"
        );

        uint256 successBalance_ = trustRedeemableERC20PoolConfig_.reserveInit
            + config_.seederFee
            + config_.redeemInit
            + config_.minimumCreatorRaise;

        creator = config_.creator;
        seederFee = config_.seederFee;
        seederUnits = config_.seederUnits;
        seederCooldownDuration = config_.seederCooldownDuration;
        redeemInit = config_.redeemInit;
        minimumCreatorRaise = config_.minimumCreatorRaise;
        seedERC20Factory = config_.seedERC20Factory;
        successBalance = successBalance_;

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

        RedeemableERC20Pool redeemableERC20Pool_ = RedeemableERC20Pool(
            trustRedeemableERC20PoolConfig_.redeemableERC20PoolFactory
                .createChild(abi.encode(
                    RedeemableERC20PoolFactoryRedeemableERC20PoolConfig(
                        trustRedeemableERC20PoolConfig_.reserve,
                        redeemableERC20_,
                        trustRedeemableERC20PoolConfig_.reserveInit,
                        trustRedeemableERC20PoolConfig_.initialValuation,
                        trustRedeemableERC20PoolConfig_.finalValuation,
                        trustRedeemableERC20PoolConfig_.minimumTradingDuration
        ))));

        token = redeemableERC20_;
        pool = redeemableERC20Pool_;

        require(
            redeemableERC20Pool_.finalValuation() >= successBalance_,
            "MIN_FINAL_VALUATION"
        );

        if (config_.seeder == address(0)) {
            require(
                0 == trustRedeemableERC20PoolConfig_.reserveInit
                    % config_.seederUnits,
                "SEED_PRICE_MULTIPLIER"
            );
            config_.seeder = address(config_.seedERC20Factory
                .createChild(abi.encode(SeedERC20Config(
                    trustRedeemableERC20PoolConfig_.reserve,
                    address(redeemableERC20Pool_),
                    // seed price.
                    redeemableERC20Pool_.reserveInit() / config_.seederUnits,
                    config_.seederUnits,
                    config_.seederCooldownDuration,
                    config_.seedERC20Config
                )))
            );
        }
        seeder = config_.seeder;

        // Need to grant transfers for a few balancer addresses to facilitate
        // setup and exits.
        redeemableERC20_.grantRole(
            redeemableERC20_.DEFAULT_ADMIN_ROLE(),
            address(redeemableERC20Pool_)
        );
        redeemableERC20_.grantRole(
            redeemableERC20_.RECEIVER(),
            redeemableERC20Pool_.crp().bFactory()
        );
        redeemableERC20_.grantRole(
            redeemableERC20_.RECEIVER(),
            address(redeemableERC20Pool_.crp())
        );
        redeemableERC20_.grantRole(
            redeemableERC20_.RECEIVER(),
            address(redeemableERC20Pool_)
        );
        redeemableERC20_.grantRole(
            redeemableERC20_.SENDER(),
            address(redeemableERC20Pool_.crp())
        );

        // The trust needs the ability to burn the distributor.
        redeemableERC20_.grantRole(
            redeemableERC20_.DISTRIBUTOR_BURNER(),
            address(this)
        );

        // The pool reserve must always be one of the treasury assets.
        redeemableERC20_.newTreasuryAsset(
            address(trustRedeemableERC20PoolConfig_.reserve)
        );

        // There is no longer any reason for the redeemableERC20 to have the
        // `Trust` as admin.
        redeemableERC20_.renounceRole(
            redeemableERC20_.DEFAULT_ADMIN_ROLE(),
            address(this)
        );

        // Send all tokens to the pool immediately.
        // When the seed funds are raised `startDutchAuction` on the
        // `RedeemableERC20Pool` will build a pool from these.
        redeemableERC20_.safeTransfer(
            address(redeemableERC20Pool_),
            trustRedeemableERC20Config_.totalSupply
        );
    }

    /// Accessor for the `TrustContracts` of this `Trust`.
    function getContracts() external view returns(TrustContracts memory) {
        return TrustContracts(
            address(pool.reserve()),
            address(token),
            address(pool),
            address(seeder),
            address(token.tierContract()),
            address(pool.crp()),
            address(pool.crp().bPool())
        );
    }

    /// Accessor for the `DistributionProgress` of this `Trust`.
    function getDistributionProgress()
        external
        view
        returns(DistributionProgress memory)
    {
        address balancerPool_ = address(pool.crp().bPool());
        uint256 poolReserveBalance_;
        uint256 poolTokenBalance_;
        if (balancerPool_ != address(0)) {
            poolReserveBalance_ = pool.reserve().balanceOf(balancerPool_);
            poolTokenBalance_ = token.balanceOf(balancerPool_);
        }
        else {
            poolReserveBalance_ = 0;
            poolTokenBalance_ = 0;
        }

        return DistributionProgress(
            getDistributionStatus(),
            pool.phaseBlocks(0),
            pool.phaseBlocks(1),
            poolReserveBalance_,
            poolTokenBalance_,
            pool.reserveInit(),
            minimumCreatorRaise,
            seederFee,
            redeemInit
        );
    }

    /// Accessor for the `DistributionStatus` of this `Trust`.
    function getDistributionStatus() public view returns (DistributionStatus) {
        Phase poolPhase_ = pool.currentPhase();
        if (poolPhase_ == Phase.ZERO) {
            if (
                pool.reserve().balanceOf(address(pool)) >= pool.reserveInit()
            ) {
                return DistributionStatus.Seeded;
            } else {
                return DistributionStatus.Pending;
            }
        }
        else if (poolPhase_ == Phase.ONE) {
            return DistributionStatus.Trading;
        }
        else if (poolPhase_ == Phase.TWO) {
            return DistributionStatus.TradingCanEnd;
        }
        else if (poolPhase_ == Phase.THREE) {
            if (finalBalance >= successBalance) {
                return DistributionStatus.Success;
            }
            else {
                return DistributionStatus.Fail;
            }
        }
        else {
            revert("UNKNOWN_POOL_PHASE");
        }
    }

    /// Anyone can send a notice about this `Trust`.
    /// The notice is opaque bytes that the indexer/GUI is expected to
    /// understand the context to decode/interpret it.
    /// @param data_ The data associated with this notice.
    function sendNotice(bytes memory data_) external {
        emit Notice(msg.sender, data_);
    }

    /// Anyone can end the distribution.
    /// The requirement is that the `minimumTradingDuration` has elapsed.
    /// If the `successBalance` is reached then the creator receives the raise
    /// and seeder earns a fee.
    /// Else the initial reserve is refunded to the seeder and sale proceeds
    /// rolled forward to token holders (not the creator).
    function anonEndDistribution() external nonReentrant {
        finalBalance = pool.reserve().balanceOf(address(pool.crp().bPool()));

        pool.ownerEndDutchAuction();
        // Burning the distributor moves the token to its `Phase.ONE` and
        // unlocks redemptions.
        // The distributor is the `bPool` itself.
        // Requires that the `Trust` has been granted `ONLY_DISTRIBUTOR_BURNER`
        // role on the `redeemableERC20`.
        token.burnDistributor(
            address(pool.crp().bPool())
        );

        // Balancer traps a tiny amount of reserve in the pool when it exits.
        uint256 poolDust_ = pool.reserve()
            .balanceOf(address(pool.crp().bPool()));
        // The dust is included in the final balance for UX reasons.
        // We don't want to fail the raise due to dust, even if technically it
        // was a failure.
        // To ensure a good UX for creators and token holders we subtract the
        // dust from the seeder.
        uint256 availableBalance_ = pool.reserve().balanceOf(address(this));

        // Base payments for each fundraiser.
        uint256 seederPay_ = pool.reserveInit() - poolDust_;
        uint256 creatorPay_ = 0;

        // Set aside the redemption and seed fee if we reached the minimum.
        if (finalBalance >= successBalance) {
            // The seeder gets an additional fee on success.
            seederPay_ = seederPay_ + seederFee;

            // The creators get new funds raised minus redeem and seed fees.
            // Can subtract without underflow due to the inequality check for
            // this code block.
            // Proof (assuming all positive integers):
            // final balance >= success balance
            // AND seed pay = seed init + seed fee
            // AND success = seed init + seed fee + token pay + min raise
            // SO success = seed pay + token pay + min raise
            // SO success >= seed pay + token pay
            // SO success - (seed pay + token pay) >= 0
            // SO final balance - (seed pay + token pay) >= 0
            //
            // Implied is the remainder of finalBalance_ as redeemInit
            // This will be transferred to the token holders below.
            creatorPay_ = availableBalance_ - ( seederPay_ + redeemInit );
        }

        if (creatorPay_ > 0) {
            pool.reserve().safeTransfer(
                creator,
                creatorPay_
            );
        }

        pool.reserve().safeTransfer(
            seeder,
            seederPay_
        );

        // Send everything left to the token holders.
        // Implicitly the remainder of the finalBalance_ is:
        // - the redeem init if successful
        // - whatever users deposited in the AMM if unsuccessful
        uint256 remainder_ = pool.reserve().balanceOf(address(this));
        if (remainder_ > 0) {
            pool.reserve().safeTransfer(
                address(token),
                remainder_
            );
        }
    }
}