// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { SaturatingMath } from "../math/SaturatingMath.sol";

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import { IBalancerConstants } from "../pool/IBalancerConstants.sol";
import { IBPool } from "../pool/IBPool.sol";
import { ICRPFactory } from "../pool/ICRPFactory.sol";
import { Rights } from "../pool/IRightsManager.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol" as ERC20;
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// solhint-disable-next-line max-line-length
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ITier } from "../tier/ITier.sol";

import { Phase } from "../phased/Phased.sol";
// solhint-disable-next-line max-line-length
import { RedeemableERC20, RedeemableERC20Config } from "../redeemableERC20/RedeemableERC20.sol";
// solhint-disable-next-line max-line-length
import { SeedERC20, SeedERC20Config } from "../seed/SeedERC20.sol";
// solhint-disable-next-line max-line-length
import { RedeemableERC20Factory } from "../redeemableERC20/RedeemableERC20Factory.sol";
import { SeedERC20Factory } from "../seed/SeedERC20Factory.sol";
import { BPoolFeeEscrow } from "../escrow/BPoolFeeEscrow.sol";
import { ERC20Config } from "../erc20/ERC20Config.sol";
import { Phase, Phased } from "../phased/Phased.sol";

// solhint-disable-next-line max-line-length
import { PoolParams, IConfigurableRightsPool } from "../pool/IConfigurableRightsPool.sol";

/// High level state of the distribution.
/// An amalgamation of the phases and states of the internal contracts.
enum DistributionStatus {
    /// Trust is created but does not have reserve funds required to start the
    /// distribution.
    Pending,
    /// Trust has enough reserve funds to start the distribution.
    Seeded,
    /// The balancer pool is funded and trading.
    Trading,
    /// The last block of the balancer pool gradual weight changes is in the
    /// past.
    TradingCanEnd,
    /// The balancer pool liquidity has been removed and distribution is
    /// successful.
    Success,
    /// The balancer pool liquidity has been removed and distribution is a
    /// failure.
    Fail
}

/// Everything required to setup a `ConfigurableRightsPool` for a `Trust`.
struct CRPConfig {
    /// Reserve side of the pool pair.
    IERC20 reserve;
    /// Redeemable ERC20 side of the pool pair.
    RedeemableERC20 token;
    /// Initial reserve value in the pool.
    uint reserveInit;
    // Initial marketcap of the token according to the balancer pool
    // denominated in reserve token.
    // The spot price of the token is ( market cap / token supply ) where
    // market cap is defined in terms of the reserve.
    // The spot price of a balancer pool token is a function of both the
    // amounts of each token and their weights.
    // This bonding curve is described in the Balancer whitepaper.
    // We define a valuation of newly minted tokens in terms of the deposited
    // reserve. The reserve weight is set to the minimum allowable value to
    // achieve maximum capital efficiency for the fund raising.
    uint initialValuation;
}

/// Configuration specific to constructing the `Trust`.
struct TrustConstructionConfig {
    /// Balancer `ConfigurableRightsPool` factory.
    address crpFactory;
    /// Balancer factory.
    address balancerFactory;
    RedeemableERC20Factory redeemableERC20Factory;
    // The `SeedERC20Factory` on the current network.
    SeedERC20Factory seedERC20Factory;
    /// Number of blocks after which emergency mode can be activated in phase
    /// two or three. Ideally this never happens and instead anon ends the
    /// auction successfully and all funds are cleared. If this does happen
    /// then creator can access any trust related tokens owned by the trust.
    uint creatorFundsReleaseTimeout;
    /// Every `Trust` built by this factory will have its raise duration
    /// limited by this max duration.
    uint maxRaiseDuration;
}

/// Configuration specific to initializing a `Trust` clone.
/// `Trust` contracts also take inner config for the pool and token.
struct TrustConfig {
    /// Reserve token address, e.g. USDC.
    IERC20 reserve;
    /// Initital reserve amount to start the LBP with.
    uint reserveInit;
    /// Initital valuation to weight the LBP against, relative to the reserve.
    uint initialValuation;
    /// Final valuation to weight the LBP against, relative to the reserve,
    /// assuming no trades.
    uint finalValuation;
    /// Minimum number of blocks the raise can be active. Relies on anon to
    /// call `endDutchAuction` to close out the auction after this many blocks.
    uint minimumTradingDuration;
    /// Address of the creator who will receive reserve assets on successful
    /// distribution.
    address creator;
    /// Minimum amount to raise for the creator from the distribution period.
    /// A successful distribution raises at least this AND also the seed fee
    /// and `redeemInit`;
    /// On success the creator receives these funds.
    /// On failure the creator receives `0`.
    uint minimumCreatorRaise;
    /// Absolute amount of reserve tokens that the seeders will receive in
    /// addition to their initial capital in the case that the raise is
    /// successful.
    uint seederFee;
    /// The initial reserve token amount to forward to the redeemable token in
    /// the case that the raise is successful. If the raise fails this is
    /// ignored and instead the full reserve amount sans seeder refund is
    /// forwarded instead.
    uint redeemInit;
}

struct TrustSeedERC20Config {
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
    uint seederUnits;
    // Cooldown duration in blocks for seed/unseed cycles.
    // Seeding requires locking funds for at least the cooldown period.
    // Ideally `unseed` is never called and `seed` leaves funds in the contract
    // until all seed tokens are sold out.
    // A failed raise cannot make funds unrecoverable, so `unseed` does exist,
    // but it should be called rarely.
    uint seederCooldownDuration;
    // ERC20Config forwarded to the seedERC20.
    ERC20Config seedERC20Config;
}

/// Forwarded config for `RedeemableERC20Config`.
struct TrustRedeemableERC20Config {
    ERC20Config erc20Config;
    ITier tier;
    uint minimumTier;
    uint totalSupply;
}

/// @title Trust
/// @notice The Balancer LBP functionality is wrapped by `RedeemableERC20Pool`.
///
/// Ensures the pool tokens created during the initialization of the
/// Balancer LBP are owned by the `Trust` and never touch an externally owned
/// account.
///
/// `RedeemableERC20Pool` has several phases:
///
/// - `Phase.ZERO`: Deployed not trading but can be by owner calling
/// `ownerStartDutchAuction`
/// - `Phase.ONE`: Trading open
/// - `Phase.TWO`: Trading open but can be closed by owner calling
/// `ownerEndDutchAuction`
/// - `Phase.THREE`: Trading closed
///
/// `RedeemableERC20Pool` expects the `Trust` to schedule the phases correctly
/// and ensure proper guards around these library functions.
///
/// @dev Deployer and controller for a Balancer ConfigurableRightsPool.
/// This library is intended for internal use by a `Trust`.
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
contract Trust is Phased, Initializable {

    /// Balancer requires a minimum balance of `10 ** 6` for all tokens at all
    /// times. ConfigurableRightsPool repo misreports this as 10 ** 12 but the
    /// Balancer Core repo has it set as `10 ** 6`. We add one here to protect
    /// ourselves against rounding issues.
    uint private constant MIN_BALANCER_POOL_BALANCE = 10 ** 6 + 1;
    /// To ensure that the dust at the end of the raise is dust-like, we
    /// enforce a minimum starting reserve balance 100x the minimum.
    uint private constant MIN_RESERVE_INIT = 10 ** 8;

    /// Summary of every contract built or referenced internally by `Trust`.
    event TrustContracts(
        /// Reserve erc20 token used to provide value to the created Balancer
        /// pool.
        address reserveERC20,
        /// Redeemable erc20 token that is minted and distributed.
        address redeemableERC20,
        /// Address that provides the initial reserve token seed.
        address seeder,
        /// Address that defines and controls tier levels for users.
        address tier,
        /// The Balancer `ConfigurableRightsPool` deployed for this
        /// distribution.
        address crp
    );

    using Math for uint256;
    using SaturatingMath for uint256;

    using SafeERC20 for IERC20;
    using SafeERC20 for RedeemableERC20;

    event CreatorFundsRelease(address token, uint amount);

    BPoolFeeEscrow public immutable bPoolFeeEscrow;
    uint public immutable maxRaiseDuration;

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
    event Notice(address sender, bytes data);

    // /// Seeder units from the initial config.
    // uint public immutable seederUnits;
    // /// Seeder cooldown duration from the initial config.
    // uint public immutable seederCooldownDuration;

    /// SeedERC20Factory from the initial config.
    /// Seeder from the initial config.
    address public seeder;
    SeedERC20Factory public immutable seedERC20Factory;
    RedeemableERC20Factory public immutable redeemableERC20Factory;
    address public immutable crpFactory;
    address public immutable balancerFactory;

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
    uint public finalBalance;
    /// Pool reserveInit + seederFee + redeemInit + minimumCreatorRaise.
    /// Could be calculated as a view function but that would require external
    /// calls to the pool contract.
    uint public successBalance;

    /// The redeemable token minted in the constructor.
    RedeemableERC20 public token;

    /// Reserve token.
    IERC20 public reserve;
    /// Initial reserve balance of the pool.
    uint public reserveInit;

    /// The `ConfigurableRightsPool` built during construction.
    IConfigurableRightsPool public crp;

    uint public minimumCreatorRaise;

    address public creator;
    uint public immutable creatorFundsReleaseTimeout;

    uint public seederFee;
    uint public redeemInit;

    /// Minimum trading duration from the initial config.
    uint public minimumTradingDuration;

    /// The final weight on the last block of the raise.
    /// Note the spot price is unknown until the end because we don't know
    /// either of the final token balances.
    uint public finalWeight;
    uint public finalValuation;

    constructor(TrustConstructionConfig memory config_) {
        seedERC20Factory = config_.seedERC20Factory;
        creatorFundsReleaseTimeout = config_.creatorFundsReleaseTimeout;
        // Assumption here that the `msg.sender` is a `TrustFactory` that the
        // `BPoolFeeEscrow` can trust. If it isn't then an insecure escrow will
        // be deployed for this `Trust` AND this `Trust` itself won't have a
        // secure parent `TrustFactory` so nobody should trust it.
        bPoolFeeEscrow = new BPoolFeeEscrow(msg.sender);
        maxRaiseDuration = config_.maxRaiseDuration;
        crpFactory = config_.crpFactory;
        balancerFactory = config_.balancerFactory;
        redeemableERC20Factory = config_.redeemableERC20Factory;
    }

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
    function initialize (
        TrustConfig memory config_,
        TrustRedeemableERC20Config memory trustRedeemableERC20Config_,
        TrustSeedERC20Config memory trustSeedERC20Config_
    ) external initializer {
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

        require(
            config_.minimumTradingDuration
                <= maxRaiseDuration,
            "MAX_RAISE_DURATION"
        );

        initializePhased();

        creator = config_.creator;
        reserve = config_.reserve;
        reserveInit = config_.reserveInit;
        minimumCreatorRaise = config_.minimumCreatorRaise;
        seederFee = config_.seederFee;
        redeemInit = config_.redeemInit;

        RedeemableERC20 redeemableERC20_ = RedeemableERC20(
            redeemableERC20Factory
                .createChild(abi.encode(
                    RedeemableERC20Config(
                        address(this),
                        address(config_.reserve),
                        trustRedeemableERC20Config_.erc20Config,
                        trustRedeemableERC20Config_.tier,
                        trustRedeemableERC20Config_.minimumTier,
                        trustRedeemableERC20Config_.totalSupply
        ))));

        token = redeemableERC20_;

        if (trustSeedERC20Config_.seeder == address(0)) {
            require(
                0 == config_.reserveInit
                    % trustSeedERC20Config_.seederUnits,
                "SEED_PRICE_MULTIPLIER"
            );
            trustSeedERC20Config_.seeder = address(seedERC20Factory
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
            config_.initialValuation >= config_.finalValuation,
            "MIN_INITIAL_VALUTION"
        );
        require(config_.creator != address(0), "CREATOR_0");

        uint successBalance_ = config_.reserveInit
            + config_.seederFee
            + config_.redeemInit
            + config_.minimumCreatorRaise;

        finalWeight = valuationWeight(
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

        IConfigurableRightsPool crp_ = setupCRP(
            CRPConfig(
                config_.reserve,
                redeemableERC20_,
                config_.reserveInit,
                config_.initialValuation
            )
        );
        redeemableERC20_.grantReceiver(
            address(bPoolFeeEscrow)
        );

        crp = crp_;

        emit TrustContracts(
            address(config_.reserve),
            address(redeemableERC20_),
            address(trustSeedERC20Config_.seeder),
            address(trustRedeemableERC20Config_.tier),
            address(crp_)
        );
    }

    /// Configures and deploys the `ConfigurableRightsPool`.
    /// Call this during initialization.
    /// @param config_ All configuration for the `RedeemableERC20Pool`.
    function setupCRP(CRPConfig memory config_)
        private
        returns (IConfigurableRightsPool)
    {
        Trust self_ = Trust(address(this));

        // The addresses in the `RedeemableERC20Pool`, as `[reserve, token]`.
        address[] memory poolAddresses_ = new address[](2);
        poolAddresses_[0] = address(config_.reserve);
        poolAddresses_[1] = address(config_.token);

        // Initial amounts as configured reserve init and total token supply.
        uint[] memory poolAmounts_ = new uint[](2);
        poolAmounts_[0] = config_.reserveInit;
        poolAmounts_[1] = config_.token.totalSupply();
        require(
            poolAmounts_[0] >= MIN_RESERVE_INIT,
            "RESERVE_INIT_MINIMUM"
        );
        require(poolAmounts_[1] > 0, "TOKEN_INIT_0");

        // Initital weights follow initial valuation reserve denominated.
        uint[] memory initialWeights_ = new uint[](2);
        initialWeights_[0] = IBalancerConstants.MIN_WEIGHT;
        initialWeights_[1] = valuationWeight(
            config_.reserveInit,
            config_.initialValuation
        );

        address crp_ = ICRPFactory(crpFactory).newCrp(
            balancerFactory,
            PoolParams(
                "R20P",
                "RedeemableERC20Pool",
                poolAddresses_,
                poolAmounts_,
                initialWeights_,
                IBalancerConstants.MIN_FEE
            ),
            Rights(
                // 0. Pause
                false,
                // 1. Change fee
                false,
                // 2. Change weights
                // (`true` needed to set gradual weight schedule)
                true,
                // 3. Add/remove tokens
                false,
                // 4. Whitelist LPs (default behaviour for `true` is that
                //    nobody can `joinPool`)
                true,
                // 5. Change cap
                false
            )
        );

        // Need to grant transfers for a few balancer addresses to facilitate
        // setup and exits.
        config_.token.grantReceiver(
            address(IConfigurableRightsPool(crp_).bFactory())
        );
        config_.token.grantReceiver(
            address(self_)
        );
        config_.token.grantSender(
            crp_
        );

        // Preapprove all tokens and reserve for the CRP.
        require(
            config_.reserve.approve(address(crp_), config_.reserveInit),
            "RESERVE_APPROVE"
        );
        require(
            config_.token.approve(address(crp_),
            config_.token.totalSupply()),
            "TOKEN_APPROVE"
        );

        return IConfigurableRightsPool(crp_);
    }

    /// https://balancer.finance/whitepaper/
    /// Spot = ( Br / Wr ) / ( Bt / Wt )
    /// => ( Bt / Wt ) = ( Br / Wr ) / Spot
    /// => Wt = ( Spot x Bt ) / ( Br / Wr )
    ///
    /// Valuation = Spot * Token supply
    /// Valuation / Supply = Spot
    /// => Wt = ( ( Val / Supply ) x Bt ) / ( Br / Wr )
    ///
    /// Bt = Total supply
    /// => Wt = ( ( Val / Bt ) x Bt ) / ( Br / Wr )
    /// => Wt = Val / ( Br / Wr )
    ///
    /// Wr = Min weight = 1
    /// => Wt = Val / Br
    ///
    /// Br = reserve balance
    /// => Wt = Val / reserve balance (reserve init if no trading occurs)
    /// @param reserveBalance_ Reserve balance to calculate weight against.
    /// @param valuation_ Valuation as ( market cap * price ) denominated in
    /// reserve to calculate a weight for.
    function valuationWeight(uint reserveBalance_, uint valuation_)
        private
        pure
        returns (uint)
    {
        uint weight_
            = ( valuation_ * IBalancerConstants.BONE ) / reserveBalance_;
        require(
            weight_ >= IBalancerConstants.MIN_WEIGHT,
            "MIN_WEIGHT_VALUATION"
        );
        // The combined weight of both tokens cannot exceed the maximum even
        // temporarily during a transaction so we need to subtract one for
        // headroom.
        require(
            ( IBalancerConstants.MAX_WEIGHT - IBalancerConstants.BONE )
            >= ( IBalancerConstants.MIN_WEIGHT + weight_ ),
            "MAX_WEIGHT_VALUATION"
        );
        return weight_;
    }

    /// Accessor for the `DistributionStatus` of this `Trust`.
    /// Used by escrows to gauge whether the raise is active or complete, and
    /// if complete whether it is success or fail.
    /// It is important that once a raise reaches success/fail that it never
    /// reverts to active or changes its completion status.
    function getDistributionStatus()
        external
        view
        returns (DistributionStatus)
    {
        Trust self_ = Trust(address(this));

        Phase poolPhase_ = self_.currentPhase();
        if (poolPhase_ == Phase.ZERO) {
            if (
                self_.reserve().balanceOf(address(this)) >= self_.reserveInit()
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
        /// Phase.FOUR is emergency funds release mode, which ideally will
        /// never happen. If it does we still use the final/success balance to
        /// calculate success/failure so that the escrows can action their own
        /// fund releases.
        else if (poolPhase_ == Phase.THREE || poolPhase_ == Phase.FOUR) {
            if (self_.finalBalance() >= self_.successBalance()) {
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
    /// The notice is opaque bytes. The indexer/GUI is expected to understand
    /// the context to decode/interpret it.
    /// @param data_ The data associated with this notice.
    function sendNotice(bytes memory data_) external {
        emit Notice(msg.sender, data_);
    }

    /// Allow `RedeemableERC20Pool` to set `finalBalance`.
    function setFinalBalance(uint finalBalance_) external {
        // Library access only.
        assert(msg.sender == address(this));
        finalBalance = finalBalance_;
    }

    /// Allow anyone to start the Balancer style dutch auction.
    /// The auction won't start unless this contract owns enough of both the
    /// tokens for the pool, so it is safe for anon to call.
    /// `Phase.ZERO` indicates the auction can start.
    /// `Phase.ONE` indicates the auction has started.
    /// `Phase.TWO` indicates the auction can be ended.
    /// `Phase.THREE` indicates the auction has ended.
    /// Creates the pool via. the CRP contract and configures the weight change
    /// curve.
    function startDutchAuction() external onlyPhase(Phase.ZERO) {
        uint finalAuctionBlock_
            = minimumTradingDuration + block.number;
        // Move to `Phase.ONE` immediately.
        scheduleNextPhase(block.number);
        // Schedule `Phase.TWO` for `1` block after auctions weights have
        // stopped changing.
        scheduleNextPhase(finalAuctionBlock_ + 1);
        // Define the weight curve.
        uint[] memory finalWeights_ = new uint[](2);
        finalWeights_[0] = IBalancerConstants.MIN_WEIGHT;
        finalWeights_[1] = finalWeight;

        IConfigurableRightsPool crp_ = crp;

        // Max pool tokens to minimise dust on exit.
        // No minimum weight change period.
        // No time lock (we handle our own locks in the trust).
        crp_.createPool(IBalancerConstants.MAX_POOL_SUPPLY, 0, 0);
        // Now that the bPool has a known address we need it to be a RECEIVER
        // as it is impossible in general for `ITier` restricted tokens to be
        // able to approve the pool itself. This ensures that token holders can
        // always sell back into the pool.
        // Note: We do NOT grant the bPool the SENDER role as that would bypass
        // `ITier` restrictions for everyone buying the token.
        token.grantReceiver(
            crp_.bPool()
        );
        crp_.updateWeightsGradually(
            finalWeights_,
            block.number,
            finalAuctionBlock_
        );
    }

    /// Allow the owner to end the Balancer style dutch auction.
    /// Moves from `Phase.TWO` to `Phase.THREE` to indicate the auction has
    /// ended.
    /// `Phase.TWO` is scheduled by `startDutchAuction`.
    /// Removes all LP tokens from the Balancer pool.
    /// Burns all unsold redeemable tokens.
    /// Forwards the reserve balance to the owner.
    function endDutchAuction() public onlyPhase(Phase.TWO) {
        // Move to `Phase.THREE` immediately.
        // Prevents reentrancy.
        scheduleNextPhase(block.number);
        IBPool pool_ = IBPool(crp.bPool());

        // Ensure the bPool is aware of the real internal token balances.
        // Balancer will ignore tokens transferred to it until they are gulped.
        pool_.gulp(address(reserve));
        pool_.gulp(address(token));

        uint totalPoolTokens_ = IERC20(address(crp)).totalSupply();

        // Balancer enforces a global minimum pool LP token supply as
        // `MIN_POOL_SUPPLY`.
        // Balancer also indirectly enforces local minimums on pool token
        // supply by enforcing minimum erc20 token balances in the pool.
        // The real minimum pool LP token supply is the largest of:
        // - The global minimum
        // - The LP token supply implied by the reserve
        // - The LP token supply implied by the token
        uint minReservePoolTokens = MIN_BALANCER_POOL_BALANCE
                .saturatingMul(totalPoolTokens_)
                // It's important to use the balance in the opinion of the
                // bPool to be sure that the pool token calculations are the
                // same.
                // WARNING: This will error if reserve balance in the pool is
                // somehow `0`. That should not be possible as balancer should
                // be preventing zero balance due to trades. If this ever
                // happens even emergency mode probably won't help because it's
                // unlikely that `exitPool` will succeed for any input values.
                / pool_.getBalance(address(reserve));
        // The minimum redeemable token supply is `10 ** 18` so it is near
        // impossible to hit this before the reserve or global pool minimums.
        uint minRedeemablePoolTokens = MIN_BALANCER_POOL_BALANCE
                .saturatingMul(totalPoolTokens_)
                // It's important to use the balance in the opinion of the
                // bPool tovbe sure that the pool token calculations are the
                // same.
                // WARNING: As above, this will error if token balance in the
                // pool is `0`.
                / pool_.getBalance(address(token));
        uint minPoolSupply_ = IBalancerConstants.MIN_POOL_SUPPLY
            .max(minReservePoolTokens)
            .max(minRedeemablePoolTokens)
            // Overcompensate for any rounding that could cause `exitPool` to
            // fail. This probably doesn't change anything because there are 9
            // OOMs between BONE and MAX_POOL_SUPPLY so `bdiv` will truncate
            // the precision a lot anyway.
            // Also `SmartPoolManager.exitPool` used internally by
            // `crp.exitPool` subtracts one so token amounts round down.
            + 1;

        uint finalBalance_ = reserve.balanceOf(address(pool_));
        finalBalance = finalBalance_;

        // This removes as much as is allowable which leaves behind some dust.
        // The reserve dust will be trapped.
        // The redeemable token will be burned when it moves to its own
        // `Phase.ONE`.
        crp.exitPool(
            // Exit the maximum allowable pool tokens.
            totalPoolTokens_
                .saturatingSub(minPoolSupply_)
                // Don't attempt to exit more tokens than the `Trust` owns.
                // This SHOULD be the same as `totalPoolTokens_` so it's just
                // guarding against some bug or edge case.
                .min(IERC20(address(crp)).balanceOf(address(this))),
            new uint[](2)
        );

        // Burning the distributor moves the rTKN to its `Phase.ONE` and
        // unlocks redemptions.
        // The distributor is the `bPool` itself and all unsold inventory.
        address[] memory distributors_ = new address[](2);
        distributors_[0] = address(this);
        distributors_[1] = address(pool_);
        token.burnDistributors(distributors_);

        // Balancer traps a tiny amount of reserve in the pool when it exits.
        uint poolDust_ = reserve.balanceOf(address(pool_));

        // The dust is included in the final balance for UX reasons.
        // We don't want to fail the raise due to dust, even if technically it
        // was a failure.
        // To ensure a good UX for creators and token holders we subtract the
        // dust from the seeder.
        // The `availableBalance_` is the reserve the `Trust` owns and so can
        // safely transfer, despite dust etc.
        uint availableBalance_ = reserve.balanceOf(address(this));

        // Base payments for each fundraiser.
        uint seederPay_ = reserveInit.saturatingSub(poolDust_);
        uint creatorPay_ = 0;

        // Set aside the redemption and seed fee if we reached the minimum.
        // `Trust` must ensure that success balance covers seeder and token pay
        // in addition to creator minimum raise.
        if (finalBalance_ >= successBalance) {
            // The seeder gets an additional fee on success.
            seederPay_ = seederPay_.saturatingAdd(seederFee);

            // The creators get new funds raised minus redeem and seed fees.
            // Implied is the remainder of finalBalance_ as redeemInit
            // This will be transferred to the token holders below.
            creatorPay_ = availableBalance_
                    .saturatingSub(
                        seederPay_.saturatingAdd(redeemInit)
                    );
        }

        if (creatorPay_ > 0) {
            reserve.safeApprove(
                creator,
                creatorPay_
            );
        }

        if (seederPay_ > 0) {
            reserve.safeApprove(
                seeder,
                seederPay_
            );
        }

        // Approve everything left to the token holders.
        // Implicitly the remainder of the finalBalance_ is:
        // - the redeem init if successful
        // - whatever users deposited in the AMM if unsuccessful
        uint remainder_ = availableBalance_
            .saturatingSub(creatorPay_.saturatingAdd(seederPay_));
        if (remainder_ > 0) {
            reserve.safeApprove(
                address(token),
                remainder_
            );
        }
    }

    /// After `endDutchAuction` has been called this function will sweep all
    /// the approvals atomically. This MAY fail if there is some bug or reason
    /// ANY of the transfers can't succeed. In that case each transfer should
    /// be attempted by each entity unatomically. This is provided as a public
    /// function as anyone can call `endDutchAuction` even if the transfers
    /// WILL succeed, so in that case it is best to process them all together
    /// as a single transaction.
    /// Consumes all approvals from `endDutchAuction` as transfers. Any zero
    /// value approvals are a no-op. If this fails for some reason then each
    /// of the creator, seeder and redeemable token can individually consume
    /// their approvals fully or partially. By default this should be called
    /// atomically after `endDutchAuction`.
    function transferAuctionTokens() public onlyAtLeastPhase(Phase.THREE) {
        Trust self_ = Trust(address(this));

        IERC20 reserve_ = self_.reserve();
        IERC20 token_ = self_.token();
        address creator_ = self_.creator();
        address seeder_ = self_.seeder();

        uint creatorAllowance_ = reserve_.allowance(address(this), creator_);
        if (creatorAllowance_ > 0) {
            reserve_.safeTransfer(creator_, creatorAllowance_);
        }
        uint seederAllowance_ = reserve_.allowance(address(this), seeder_);
        if (seederAllowance_ > 0) {
            reserve_.safeTransfer(seeder_, seederAllowance_);
        }
        uint tokenAllowance_ = reserve_
            .allowance(address(this), address(token_));
        if (tokenAllowance_ > 0) {
            reserve_.safeTransfer(address(token_), tokenAllowance_);
        }
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
        transferAuctionTokens();
    }

    /// `endDutchAuction` is apparently critically failing.
    /// Move to Phase.FOUR immediately.
    /// This can ONLY be done when the contract has been in the current phase
    /// for at least `creatorFundsReleaseTimeout` blocks.
    /// Either it did not run at all, or somehow it failed to grant access
    /// to funds.
    /// Phase.ZERO unsupported:
    /// How to back out of the pre-seed stage??
    /// Someone sent reserve but not enough to start the auction, and auction
    /// will never start?
    /// Phase.ONE unsupported:
    /// We're mid-distribution, creator will need to wait.
    function enableCreatorFundsRelease() external onlyAtLeastPhase(Phase.TWO) {
        Phase startPhase_ = currentPhase();
        require(
            blockNumberForPhase(
                phaseBlocks,
                startPhase_
            ) + creatorFundsReleaseTimeout <= block.number,
            "EARLY_RELEASE"
        );
        // Move to `Phase.FOUR` immediately.
        scheduleNextPhase(block.number);
        if (startPhase_ == Phase.TWO) {
            scheduleNextPhase(block.number);
        }
    }

    /// Anon can approve any amount of reserve, redeemable or CRP LP token for
    /// the creator to transfer to themselves. The `Trust` MUST ensure this is
    /// only callable during `Phase.FOUR` (emergency funds release phase).
    ///
    /// Tokens unknown to the `Trust` CANNOT be released in this way. We don't
    /// allow the `Trust` to call functions on arbitrary external contracts.
    ///
    /// Normally the `Trust` is NOT in emergency mode, and the creator cannot
    /// do anything to put the `Trust` into emergency mode other than wait for
    /// the timeout like everybody else. Normally anon will end the auction
    /// successfully long before emergency mode is possible.
    /// @param token_ Forwarded to `RedeemableERC20Pool.creatorFundsRelease`.
    /// @param amount_ Forwarded to `RedeemableERC20Pool.creatorFundsRelease`.
    function creatorFundsRelease(address token_, uint amount_)
        external
        onlyPhase(Phase.FOUR)
    {
        Trust self_ = Trust(address(this));
        require(
            token_ == address(self_.reserve())
            || token_ == address(self_.token())
            || token_ == address(self_.crp()),
            "UNKNOWN_TOKEN"
        );
        emit CreatorFundsRelease(token_, amount_);
        IERC20(token_).safeIncreaseAllowance(self_.creator(), amount_);
    }

    /// Enforce `Phase.FOUR` as the last phase.
    /// @inheritdoc Phased
    function _beforeScheduleNextPhase(uint nextPhaseBlock_)
        internal
        override
        virtual
    {
        super._beforeScheduleNextPhase(nextPhaseBlock_);
        assert(currentPhase() < Phase.FOUR);
    }
}