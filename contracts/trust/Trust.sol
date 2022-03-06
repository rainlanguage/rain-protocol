// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {SaturatingMath} from "../math/SaturatingMath.sol";

import {IBalancerConstants} from "../pool/IBalancerConstants.sol";
import {IBPool} from "../pool/IBPool.sol";
import {ICRPFactory} from "../pool/ICRPFactory.sol";
import {Rights} from "../pool/IRightsManager.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// solhint-disable-next-line max-line-length
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// solhint-disable-next-line max-line-length
import {RedeemableERC20, RedeemableERC20Config} from "../redeemableERC20/RedeemableERC20.sol";
import {SeedERC20, SeedERC20Config} from "../seed/SeedERC20.sol";
// solhint-disable-next-line max-line-length
import {RedeemableERC20Factory} from "../redeemableERC20/RedeemableERC20Factory.sol";
import {SeedERC20Factory} from "../seed/SeedERC20Factory.sol";
import {BPoolFeeEscrow} from "../escrow/BPoolFeeEscrow.sol";
import {ERC20Config} from "../erc20/ERC20Config.sol";
import {Phased} from "../phased/Phased.sol";

import "../sale/ISale.sol";

// solhint-disable-next-line max-line-length
import {PoolParams, IConfigurableRightsPool} from "../pool/IConfigurableRightsPool.sol";

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
/// @param reserve Reserve side of the pool pair.
/// @param token Redeemable ERC20 side of the pool pair.
/// @param reserveInit Initial reserve value in the pool.
/// @param tokenSupply Total token supply.
/// @param initialValuation Initial marketcap of the token according to the
/// balancer pool denominated in reserve token.
/// The spot price of the token is ( market cap / token supply ) where market
/// cap is defined in terms of the reserve. The spot price of a balancer pool
/// token is a function of both the amounts of each token and their weights.
/// This bonding curve is described in the Balancer whitepaper. We define a
/// valuation of newly minted tokens in terms of the deposited reserve. The
/// reserve weight is set to the minimum allowable value to achieve maximum
/// capital efficiency for the fund raising.
struct CRPConfig {
    address reserve;
    address token;
    uint256 reserveInit;
    uint256 tokenSupply;
    uint256 initialValuation;
}

/// Configuration specific to constructing the `Trust`.
/// @param crpFactory Balancer `ConfigurableRightsPool` factory.
/// @param balancerFactory Balancer factory.
/// @param redeemableERC20Factory `RedeemableERC20Factory`.
/// @param seedERC20Factory The `SeedERC20Factory` on the current network.
/// @param creatorFundsReleaseTimeout Number of blocks after which emergency
/// mode can be activated in phase two or three. Ideally this never happens and
/// instead anon ends the auction successfully and all funds are cleared. If
/// this does happen then creator can access any trust related tokens owned by
/// the trust.
/// @param maxRaiseDuration Every `Trust` built by this factory will have its
/// raise duration limited by this max duration.
struct TrustConstructionConfig {
    address crpFactory;
    address balancerFactory;
    RedeemableERC20Factory redeemableERC20Factory;
    SeedERC20Factory seedERC20Factory;
    uint256 creatorFundsReleaseTimeout;
    uint256 maxRaiseDuration;
}

/// Configuration specific to initializing a `Trust` clone.
/// `Trust` contracts also take inner config for the pool and token.
/// @param reserve Reserve token address, e.g. USDC.
/// @param reserveInit Initital reserve amount to start the LBP with.
/// @param initialValuation Initital valuation to weight the LBP against,
/// relative to the reserve.
/// @param finalValuation Final valuation to weight the LBP against, relative
/// to the reserve, assuming no trades.
/// @param minimumTradingDuration Minimum number of blocks the raise can be
/// active. Relies on anon to call `endDutchAuction` to close out the auction
/// after this many blocks.
/// @param creator Address of the creator who will receive reserve assets on
/// successful distribution.
/// @param minimumCreatorRaise Minimum amount to raise for the creator from the
/// distribution period. A successful distribution raises at least this
/// AND also the seed fee and `redeemInit`;
/// On success the creator receives these funds.
/// On failure the creator receives `0`.
/// @param seederFee Absolute amount of reserve tokens that the seeders will
/// receive in addition to their initial capital in the case that the raise is
/// successful.
/// @param redeemInit The initial reserve token amount to forward to the
/// redeemable token in the case that the raise is successful. If the raise
/// fails this is ignored and instead the full reserve amount sans seeder
/// refund is forwarded instead.
struct TrustConfig {
    IERC20 reserve;
    uint256 reserveInit;
    uint256 initialValuation;
    uint256 finalValuation;
    uint256 minimumTradingDuration;
    address creator;
    uint256 minimumCreatorRaise;
    uint256 seederFee;
    uint256 redeemInit;
}

/// Forwarded config for `SeedERC20Config`.
/// @param seeder Either an EOA (externally owned address) or `address(0)`.
/// If an EOA the seeder account must transfer seed funds to the newly
/// constructed `Trust` before distribution can start.
/// If `address(0)` a new `SeedERC20` contract is built in the `Trust`
/// constructor.
struct TrustSeedERC20Config {
    address seeder;
    uint256 cooldownDuration;
    ERC20Config erc20Config;
}

/// Forwarded config for `RedeemableERC20Config`.
struct TrustRedeemableERC20Config {
    ERC20Config erc20Config;
    address tier;
    uint256 minimumTier;
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
contract Trust is Phased, ISale {
    using Math for uint256;
    using SaturatingMath for uint256;

    using SafeERC20 for IERC20;
    using SafeERC20 for RedeemableERC20;

    /// Balancer requires a minimum balance of `10 ** 6` for all tokens at all
    /// times. ConfigurableRightsPool repo misreports this as 10 ** 12 but the
    /// Balancer Core repo has it set as `10 ** 6`. We add one here to protect
    /// ourselves against rounding issues.
    uint256 private constant MIN_BALANCER_POOL_BALANCE = 10**6 + 1;
    /// To ensure that the dust at the end of the raise is dust-like, we
    /// enforce a minimum starting reserve balance 100x the minimum.
    uint256 private constant MIN_RESERVE_INIT = 10**8;

    /// Trust is not initialized.
    uint256 private constant PHASE_UNINITIALIZED = 0;
    /// Trust has not received reserve funds to start a raise.
    uint256 private constant PHASE_PENDING = 1;
    /// Trust has started trading against an LBP.
    uint256 private constant PHASE_TRADING = 2;
    /// LBP can end.
    uint256 private constant PHASE_CAN_END = 3;
    /// LBP has ended successfully and funds are distributed.
    uint256 private constant PHASE_ENDED = 4;
    /// LBP failed to end somehow and creator must handle funds.
    uint256 private constant PHASE_EMERGENCY = 5;

    /// Trust has been constructed.
    /// Intended for use with a `TrustFactory` that will clone all these.
    /// @param sender `msg.sender` of the construction.
    event Construction(
        address sender,
        address balancerFactory,
        address crpFactory,
        address redeemableERC20Factory,
        address seedERC20Factory,
        address bPoolFeeEscrow,
        uint256 creatorFundsReleaseTimeout,
        uint256 maxRaiseDuration
    );

    /// Summary of every contract built or referenced internally by `Trust`.
    /// @param sender `msg.sender` of the initialize.
    /// @param config config input to initialize.
    /// @param crp The Balancer `ConfigurableRightsPool` deployed for this
    /// distribution.
    /// @param seeder Address that provides the initial reserve token seed.
    /// @param redeemableERC20 Redeemable erc20 token that is minted and
    /// distributed.
    /// @param successBalance Success balance calculated from the config.
    event Initialize(
        address sender,
        TrustConfig config,
        address crp,
        address seeder,
        address redeemableERC20,
        uint256 successBalance
    );

    /// The dutch auction has started.
    /// @param sender `msg.sender` of the auction start.
    /// @param pool The pool created for the auction.
    /// @param finalAuctionBlock The block the auction can end after.
    event StartDutchAuction(
        address sender,
        address pool,
        uint256 finalAuctionBlock
    );

    /// The dutch auction has ended.
    /// @param sender `msg.sender` of the auction end.
    /// @param finalBalance Final balance of the auction that is payable to
    /// participants. Doesn't include trapped dust.
    /// @param seederPay Amount paid to seeder.
    /// @param creatorPay Amount paid to raise creator.
    /// @param tokenPay Amount paid to redeemable token.
    /// @param poolDust Dust trapped in the pool.
    event EndDutchAuction(
        address sender,
        uint256 finalBalance,
        uint256 seederPay,
        uint256 creatorPay,
        uint256 tokenPay,
        uint256 poolDust
    );

    /// Funds released for creator in emergency mode.
    /// @param sender `msg.sender` of the funds release.
    /// @param token Token being released.
    /// @param amount Amount of token released.
    event CreatorFundsRelease(address sender, address token, uint256 amount);

    /// Balancer pool fee escrow used for trust trades.
    BPoolFeeEscrow private immutable bPoolFeeEscrow;

    /// Max duration that can be initialized for the `Trust`.
    uint256 private immutable maxRaiseDuration;

    /// Seeder from the initial config.
    address private seeder;
    /// `SeedERC20Factory` from the construction config.
    SeedERC20Factory private immutable seedERC20Factory;
    /// `RedeemableERC20Factory` from the construction config.
    RedeemableERC20Factory private immutable redeemableERC20Factory;
    /// `CRPFactory` from the construction config.
    address private immutable crpFactory;
    /// `BalancerFactory` from the construction config.
    address private immutable balancerFactory;

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
    uint256 private finalBalance;
    /// Pool reserveInit + seederFee + redeemInit + minimumCreatorRaise.
    /// Could be calculated as a view function but that would require external
    /// calls to the pool contract.
    uint256 private successBalance;

    /// The redeemable token minted in the constructor.
    RedeemableERC20 private _token;
    /// Reserve token.
    IERC20 private _reserve;
    /// The `ConfigurableRightsPool` built during construction.
    IConfigurableRightsPool public crp;

    /// Initial reserve balance of the pool.
    uint256 private reserveInit;

    /// Minimum amount that must be raised for the creator for a success.
    /// Dust, seeder and token balances must be added to this for the final
    /// pool success value.
    uint256 private minimumCreatorRaise;

    /// The creator of the raise.
    address private creator;
    /// After this many blocks in a raise-endable state, the creator funds
    /// release can be activated. Ideally this is either never activated or by
    /// the time it is activated all funds are long gone due to a successful
    /// raise end distribution.
    uint256 private immutable creatorFundsReleaseTimeout;

    /// The fee paid to seeders on top of the seeder input if the raise is a
    /// success.
    uint256 private seederFee;
    /// The reserve forwarded to the redeemable token if the raise is a
    /// success.
    uint256 private redeemInit;

    /// Minimum trading duration from the initial config.
    uint256 private minimumTradingDuration;

    /// The final weight on the last block of the raise.
    /// Note the spot price is unknown until the end because we don't know
    /// either of the final token balances.
    uint256 private finalWeight;

    constructor(TrustConstructionConfig memory config_) {
        balancerFactory = config_.balancerFactory;
        crpFactory = config_.crpFactory;
        redeemableERC20Factory = config_.redeemableERC20Factory;
        seedERC20Factory = config_.seedERC20Factory;
        BPoolFeeEscrow bPoolFeeEscrow_ = new BPoolFeeEscrow();
        bPoolFeeEscrow = bPoolFeeEscrow_;
        creatorFundsReleaseTimeout = config_.creatorFundsReleaseTimeout;
        // Assumption here that the `msg.sender` is a `TrustFactory` that the
        // `BPoolFeeEscrow` can trust. If it isn't then an insecure escrow will
        // be deployed for this `Trust` AND this `Trust` itself won't have a
        // secure parent `TrustFactory` so nobody should trust it.
        maxRaiseDuration = config_.maxRaiseDuration;

        emit Construction(
            msg.sender,
            config_.balancerFactory,
            config_.crpFactory,
            address(config_.redeemableERC20Factory),
            address(config_.seedERC20Factory),
            address(bPoolFeeEscrow_),
            config_.creatorFundsReleaseTimeout,
            config_.maxRaiseDuration
        );
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
    // Slither false positive. `initializePhased` cannot be reentrant.
    // https://github.com/crytic/slither/issues/887
    // slither-disable-next-line reentrancy-benign
    function initialize(
        TrustConfig memory config_,
        TrustRedeemableERC20Config memory trustRedeemableERC20Config_,
        TrustSeedERC20Config memory trustSeedERC20Config_
    ) external {
        initializePhased();
        // Copied from onlyPhase so it can sit after `initializePhased`.
        require(currentPhase() == PHASE_UNINITIALIZED, "BAD_PHASE");
        schedulePhase(PHASE_PENDING, block.number);

        require(config_.creator != address(0), "CREATOR_0");
        require(address(config_.reserve) != address(0), "RESERVE_0");
        require(
            config_.reserveInit >= MIN_RESERVE_INIT,
            "RESERVE_INIT_MINIMUM"
        );
        require(
            config_.initialValuation >= config_.finalValuation,
            "MIN_INITIAL_VALUTION"
        );

        creator = config_.creator;
        _reserve = config_.reserve;
        reserveInit = config_.reserveInit;

        // If the raise really does have a minimum of `0` and `0` trading
        // happens then the raise will be considered a "success", burning all
        // rTKN, which would trap any escrowed or deposited funds that nobody
        // can retrieve as nobody holds any rTKN.
        // A zero or very low minimum raise is very likely NOT what you want
        // for a LBP, consider using `Sale` instead, which supports rTKN
        // forwarding in the case of a raise not selling out.
        require(config_.minimumCreatorRaise > 0, "MIN_RAISE_0");
        minimumCreatorRaise = config_.minimumCreatorRaise;
        seederFee = config_.seederFee;
        redeemInit = config_.redeemInit;

        finalWeight = valuationWeight(
            config_.reserveInit,
            config_.finalValuation
        );

        uint256 successBalance_ = config_.reserveInit +
            config_.seederFee +
            config_.redeemInit +
            config_.minimumCreatorRaise;

        require(
            config_.finalValuation >= successBalance_,
            "MIN_FINAL_VALUATION"
        );
        successBalance = successBalance_;

        require(
            config_.minimumTradingDuration <= maxRaiseDuration,
            "MAX_RAISE_DURATION"
        );
        require(config_.minimumTradingDuration > 0, "0_TRADING_DURATION");
        minimumTradingDuration = config_.minimumTradingDuration;

        address redeemableERC20_ = initializeRedeemableERC20(
            config_,
            trustRedeemableERC20Config_
        );
        _token = RedeemableERC20(redeemableERC20_);

        address seeder_ = initializeSeeder(config_, trustSeedERC20Config_);
        seeder = seeder_;

        address crp_ = initializeCRP(
            CRPConfig(
                address(config_.reserve),
                redeemableERC20_,
                config_.reserveInit,
                trustRedeemableERC20Config_.erc20Config.initialSupply,
                config_.initialValuation
            )
        );
        crp = IConfigurableRightsPool(crp_);

        emit Initialize(
            msg.sender,
            config_,
            crp_,
            seeder_,
            address(redeemableERC20_),
            successBalance_
        );
    }

    /// Initializes the `RedeemableERC20` token used by the trust.
    function initializeRedeemableERC20(
        TrustConfig memory config_,
        TrustRedeemableERC20Config memory trustRedeemableERC20Config_
    ) private returns (address) {
        // There are additional minimum reserve init and token supply
        // restrictions enforced by `RedeemableERC20` and
        // `RedeemableERC20Pool`. This ensures that the weightings and
        // valuations will be in a sensible range according to the internal
        // assumptions made by Balancer etc.
        require(
            trustRedeemableERC20Config_.erc20Config.initialSupply >=
                config_.reserveInit,
            "MIN_TOKEN_SUPPLY"
        );
        // Whatever address is provided for erc20Config as the distributor is
        // ignored and overwritten as the `Trust`.
        trustRedeemableERC20Config_.erc20Config.distributor = address(this);
        RedeemableERC20 redeemableERC20_ = RedeemableERC20(
            redeemableERC20Factory.createChild(
                abi.encode(
                    RedeemableERC20Config(
                        address(config_.reserve),
                        trustRedeemableERC20Config_.erc20Config,
                        trustRedeemableERC20Config_.tier,
                        trustRedeemableERC20Config_.minimumTier,
                        // Forwarding address is always zero
                        // (i.e. distribution will burn unsold rTKN)
                        // because LBP mechanics basically mandate many unsold
                        // tokens.
                        address(0)
                    )
                )
            )
        );
        redeemableERC20_.grantReceiver(address(bPoolFeeEscrow));
        return address(redeemableERC20_);
    }

    /// Initializes the seeder used by the `Trust`.
    /// If `TrustSeedERC20Config.seeder` is `address(0)` a new `SeedERC20`
    /// contract is cloned, otherwise the seeder is used verbatim.
    function initializeSeeder(
        TrustConfig memory config_,
        TrustSeedERC20Config memory trustSeedERC20Config_
    ) private returns (address) {
        address seeder_ = trustSeedERC20Config_.seeder;
        if (seeder_ == address(0)) {
            require(
                0 ==
                    config_.reserveInit %
                        trustSeedERC20Config_.erc20Config.initialSupply,
                "SEED_PRICE_MULTIPLIER"
            );
            seeder_ = address(
                seedERC20Factory.createChild(
                    abi.encode(
                        SeedERC20Config(
                            config_.reserve,
                            address(this),
                            // seed price.
                            config_.reserveInit /
                                trustSeedERC20Config_.erc20Config.initialSupply,
                            trustSeedERC20Config_.cooldownDuration,
                            trustSeedERC20Config_.erc20Config
                        )
                    )
                )
            );
        }
        return seeder_;
    }

    /// Configures and deploys the `ConfigurableRightsPool`.
    /// Call this during initialization.
    /// @param config_ All configuration for the `RedeemableERC20Pool`.
    function initializeCRP(CRPConfig memory config_) private returns (address) {
        // The addresses in the `RedeemableERC20Pool`, as `[reserve, token]`.
        address[] memory poolAddresses_ = new address[](2);
        poolAddresses_[0] = address(config_.reserve);
        poolAddresses_[1] = address(config_.token);

        // Initial amounts as configured reserve init and total token supply.
        uint256[] memory poolAmounts_ = new uint256[](2);
        poolAmounts_[0] = config_.reserveInit;
        poolAmounts_[1] = config_.tokenSupply;

        // Initital weights follow initial valuation reserve denominated.
        uint256[] memory initialWeights_ = new uint256[](2);
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
        RedeemableERC20(config_.token).grantReceiver(
            address(IConfigurableRightsPool(crp_).bFactory())
        );
        RedeemableERC20(config_.token).grantReceiver(address(this));
        RedeemableERC20(config_.token).grantSender(crp_);

        // Preapprove all tokens and reserve for the CRP.
        IERC20(config_.reserve).safeApprove(address(crp_), config_.reserveInit);
        IERC20(config_.token).safeApprove(address(crp_), config_.tokenSupply);

        return crp_;
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
    function valuationWeight(uint256 reserveBalance_, uint256 valuation_)
        private
        pure
        returns (uint256)
    {
        uint256 weight_ = (valuation_ * IBalancerConstants.BONE) /
            reserveBalance_;
        require(
            weight_ >= IBalancerConstants.MIN_WEIGHT,
            "MIN_WEIGHT_VALUATION"
        );
        // The combined weight of both tokens cannot exceed the maximum even
        // temporarily during a transaction so we need to subtract one for
        // headroom.
        require(
            (IBalancerConstants.MAX_WEIGHT - IBalancerConstants.BONE) >=
                (IBalancerConstants.MIN_WEIGHT + weight_),
            "MAX_WEIGHT_VALUATION"
        );
        return weight_;
    }

    /// @inheritdoc ISale
    function token() external view returns (address) {
        return address(_token);
    }

    /// @inheritdoc ISale
    function reserve() external view returns (address) {
        return address(_reserve);
    }

    /// @inheritdoc ISale
    function saleStatus() external view returns (SaleStatus) {
        uint256 poolPhase_ = currentPhase();
        if (poolPhase_ == PHASE_ENDED || poolPhase_ == PHASE_EMERGENCY) {
            if (finalBalance >= successBalance) {
                return SaleStatus.Success;
            } else {
                return SaleStatus.Fail;
            }
        } else {
            return SaleStatus.Pending;
        }
    }

    /// Accessor for the `DistributionStatus` of this `Trust`.
    /// Some of the distribution statuses are derived from the state of the
    /// contract in addition to the phase.
    function getDistributionStatus()
        external
        view
        returns (DistributionStatus)
    {
        uint256 poolPhase_ = currentPhase();
        if (poolPhase_ == PHASE_UNINITIALIZED) {
            return DistributionStatus.Pending;
        }
        if (poolPhase_ == PHASE_PENDING) {
            if (_reserve.balanceOf(address(this)) >= reserveInit) {
                return DistributionStatus.Seeded;
            } else {
                return DistributionStatus.Pending;
            }
        } else if (poolPhase_ == PHASE_TRADING) {
            return DistributionStatus.Trading;
        } else if (poolPhase_ == PHASE_CAN_END) {
            return DistributionStatus.TradingCanEnd;
        }
        /// Phase.FOUR is emergency funds release mode, which ideally will
        /// never happen. If it does we still use the final/success balance to
        /// calculate success/failure so that the escrows can action their own
        /// fund releases.
        else if (poolPhase_ == PHASE_ENDED || poolPhase_ == PHASE_EMERGENCY) {
            if (finalBalance >= successBalance) {
                return DistributionStatus.Success;
            } else {
                return DistributionStatus.Fail;
            }
        } else {
            revert("UNKNOWN_POOL_PHASE");
        }
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
    function startDutchAuction() external onlyPhase(PHASE_PENDING) {
        uint256 finalAuctionBlock_ = minimumTradingDuration + block.number;
        // Move to `Phase.ONE` immediately.
        schedulePhase(PHASE_TRADING, block.number);
        // Schedule `Phase.TWO` for `1` block after auctions weights have
        // stopped changing.
        schedulePhase(PHASE_CAN_END, finalAuctionBlock_ + 1);
        // Define the weight curve.
        uint256[] memory finalWeights_ = new uint256[](2);
        finalWeights_[0] = IBalancerConstants.MIN_WEIGHT;
        finalWeights_[1] = finalWeight;

        IConfigurableRightsPool crp_ = crp;

        // Max pool tokens to minimise dust on exit.
        // No minimum weight change period.
        // No time lock (we handle our own locks in the trust).
        crp_.createPool(IBalancerConstants.MAX_POOL_SUPPLY, 0, 0);
        address pool_ = crp_.bPool();
        emit StartDutchAuction(msg.sender, pool_, finalAuctionBlock_);
        // Now that the bPool has a known address we need it to be a RECEIVER
        // as it is impossible in general for `ITier` restricted tokens to be
        // able to approve the pool itself. This ensures that token holders can
        // always sell back into the pool.
        // Note: We do NOT grant the bPool the SENDER role as that would bypass
        // `ITier` restrictions for everyone buying the token.
        _token.grantReceiver(pool_);
        crp_.updateWeightsGradually(
            finalWeights_,
            block.number,
            finalAuctionBlock_
        );
    }

    function exitPool() private {
        IBPool pool_ = IBPool(crp.bPool());

        // Ensure the bPool is aware of the real internal token balances.
        // Balancer will ignore tokens transferred to it until they are gulped.
        pool_.gulp(address(_reserve));
        pool_.gulp(address(_token));

        uint256 totalPoolTokens_ = IERC20(address(crp)).totalSupply();

        // Balancer enforces a global minimum pool LP token supply as
        // `MIN_POOL_SUPPLY`.
        // Balancer also indirectly enforces local minimums on pool token
        // supply by enforcing minimum erc20 token balances in the pool.
        // The real minimum pool LP token supply is the largest of:
        // - The global minimum
        // - The LP token supply implied by the reserve
        // - The LP token supply implied by the token
        uint256 minReservePoolTokens_ = MIN_BALANCER_POOL_BALANCE.saturatingMul(
                totalPoolTokens_
            ) /
            // It's important to use the balance in the opinion of the
            // bPool to be sure that the pool token calculations are the
            // same.
            // WARNING: This will error if reserve balance in the pool is
            // somehow `0`. That should not be possible as balancer should
            // be preventing zero balance due to trades. If this ever
            // happens even emergency mode probably won't help because it's
            // unlikely that `exitPool` will succeed for any input values.
            pool_.getBalance(address(_reserve));
        // The minimum redeemable token supply is `10 ** 18` so it is near
        // impossible to hit this before the reserve or global pool minimums.
        uint256 minRedeemablePoolTokens_ = MIN_BALANCER_POOL_BALANCE
            .saturatingMul(totalPoolTokens_) /
            // It's important to use the balance in the opinion of the
            // bPool tovbe sure that the pool token calculations are the
            // same.
            // WARNING: As above, this will error if token balance in the
            // pool is `0`.
            pool_.getBalance(address(_token));
        uint256 minPoolSupply_ = IBalancerConstants
            .MIN_POOL_SUPPLY
            .max(minReservePoolTokens_)
            .max(minRedeemablePoolTokens_) +
            // Overcompensate for any rounding that could cause `exitPool` to
            // fail. This probably doesn't change anything because there are 9
            // OOMs between BONE and MAX_POOL_SUPPLY so `bdiv` will truncate
            // the precision a lot anyway.
            // Also `SmartPoolManager.exitPool` used internally by
            // `crp.exitPool` subtracts one so token amounts round down.
            1;

        // This removes as much as is allowable which leaves behind some dust.
        // The reserve dust will be trapped.
        // The redeemable token will be burned when it moves to its own
        // `Phase.ONE`.
        crp.exitPool(
            // Exit the maximum allowable pool tokens.
            totalPoolTokens_.saturatingSub(minPoolSupply_).min(
                // Don't attempt to exit more tokens than the `Trust` owns.
                // This SHOULD be the same as `totalPoolTokens_` so it's just
                // guarding against some bug or edge case.
                IERC20(address(crp)).balanceOf(address(this))
            ),
            new uint256[](2)
        );
    }

    /// Allow the owner to end the Balancer style dutch auction.
    /// Moves from `Phase.TWO` to `Phase.THREE` to indicate the auction has
    /// ended.
    /// `Phase.TWO` is scheduled by `startDutchAuction`.
    /// Removes all LP tokens from the Balancer pool.
    /// Burns all unsold redeemable tokens.
    /// Forwards the reserve balance to the owner.
    // `SaturatingMath` is used in case there is somehow an edge case not
    // considered that causes overflow/underflow, we still want to approve
    // the final state so as not to trap funds with an underflow error.
    function endDutchAuction() public onlyPhase(PHASE_CAN_END) {
        // Move to `PHASE_ENDED` immediately.
        // Prevents reentrancy.
        schedulePhase(PHASE_ENDED, block.number);

        exitPool();

        address pool_ = crp.bPool();

        // Burning the distributor moves the rTKN to its `Phase.ONE` and
        // unlocks redemptions.
        // The distributor is the `bPool` itself and all unsold inventory.
        // First we send all exited rTKN back to the pool so it can be burned.
        IERC20(address(_token)).safeTransfer(
            pool_,
            _token.balanceOf(address(this))
        );
        _token.endDistribution(pool_);

        // The dust is NOT included in the final balance.
        // The `availableBalance_` is the reserve the `Trust` owns and so can
        // safely transfer, despite dust etc.
        uint256 finalBalance_ = _reserve.balanceOf(address(this));
        finalBalance = finalBalance_;

        // `Trust` must ensure that success balance covers seeder and token pay
        // in addition to creator minimum raise. Otherwise someone won't get
        // paid in full.
        bool success_ = successBalance <= finalBalance_;

        // We do our best to pay each party in full in priority order:
        // - Seeder
        // - rTKN
        // - Creator
        // There is some pool dust that makes it a bit unpredictable exactly
        // who will be paid slightly less than they are expecting at the edge
        // cases.
        uint256 seederPay_ = reserveInit;
        // The seeder gets an additional fee on success.
        if (success_) {
            seederPay_ = seederPay_.saturatingAdd(seederFee);
        }
        // The `finalBalance_` can be lower than the seeder entitlement due to
        // unavoidable pool dust trapped in Balancer.
        seederPay_ = seederPay_.min(finalBalance_);

        // Once the seeder is covered the remaining capital is allocated
        // according to success/fail of the raise.
        uint256 tokenPay_ = 0;
        uint256 creatorPay_ = 0;
        uint256 remaining_ = finalBalance_.saturatingSub(seederPay_);
        if (success_) {
            // This `.min` is guarding against pool dust edge cases.
            // Any raise the exceeds the success balance by more than the dust
            // will cover the seeder and token in full, in which case the
            // creator covers the dust from their excess.
            tokenPay_ = redeemInit.min(remaining_);
            creatorPay_ = remaining_.saturatingSub(tokenPay_);
        } else {
            // Creator gets nothing on a failed raise. Send what is left to the
            // rTKN. Pool dust is taken from here to make the seeder whole if
            // possible.
            tokenPay_ = remaining_;
        }

        emit EndDutchAuction(
            msg.sender,
            finalBalance_,
            seederPay_,
            creatorPay_,
            tokenPay_,
            // Read dust balance from the pool.
            _reserve.balanceOf(pool_)
        );

        if (seederPay_ > 0) {
            _reserve.safeApprove(seeder, seederPay_);
        }

        if (creatorPay_ > 0) {
            _reserve.safeApprove(creator, creatorPay_);
        }

        if (tokenPay_ > 0) {
            _reserve.safeApprove(address(_token), tokenPay_);
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
    function transferAuctionTokens() public onlyAtLeastPhase(PHASE_ENDED) {
        IERC20 reserve_ = _reserve;
        RedeemableERC20 token_ = _token;
        address creator_ = creator;
        address seeder_ = seeder;

        uint256 creatorAllowance_ = reserve_.allowance(address(this), creator_);
        uint256 seederAllowance_ = reserve_.allowance(address(this), seeder_);
        uint256 tokenAllowance_ = reserve_.allowance(
            address(this),
            address(token_)
        );

        if (creatorAllowance_ > 0) {
            reserve_.safeTransfer(creator_, creatorAllowance_);
        }
        if (seederAllowance_ > 0) {
            reserve_.safeTransfer(seeder_, seederAllowance_);
        }
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
    /// Move to PHASE_EMERGENCY immediately.
    /// This can ONLY be done when the contract has been in the current phase
    /// for at least `creatorFundsReleaseTimeout` blocks.
    /// Either it did not run at all, or somehow it failed to grant access
    /// to funds.
    /// This cannot be done until after the raise can end.
    function enableCreatorFundsRelease()
        external
        onlyAtLeastPhase(PHASE_CAN_END)
    {
        uint256 startPhase_ = currentPhase();
        require(
            blockNumberForPhase(phaseBlocks, startPhase_) +
                creatorFundsReleaseTimeout <=
                block.number,
            "EARLY_RELEASE"
        );
        // Move to `PHASE_EMERGENCY` immediately.
        if (startPhase_ == PHASE_CAN_END) {
            schedulePhase(PHASE_ENDED, block.number);
        }
        schedulePhase(PHASE_EMERGENCY, block.number);
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
    function creatorFundsRelease(address token_, uint256 amount_)
        external
        onlyPhase(PHASE_EMERGENCY)
    {
        require(
            token_ == address(_reserve) ||
                token_ == address(_token) ||
                token_ == address(crp),
            "UNKNOWN_TOKEN"
        );
        emit CreatorFundsRelease(msg.sender, token_, amount_);
        IERC20(token_).safeIncreaseAllowance(creator, amount_);
    }
}
