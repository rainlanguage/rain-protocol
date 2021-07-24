// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol" as ERC20;
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { CRPFactory } from "./configurable-rights-pool/contracts/CRPFactory.sol";
import { BFactory } from "./configurable-rights-pool/contracts/test/BFactory.sol";

import { IPrestige } from "./tv-prestige/contracts/IPrestige.sol";

import { Phase } from "./Phased.sol";
import { RedeemableERC20, RedeemableERC20Config } from "./RedeemableERC20.sol";
import { RedeemableERC20Pool, RedeemableERC20PoolConfig } from "./RedeemableERC20Pool.sol";
import { SeedERC20, SeedERC20Config } from "./SeedERC20.sol";

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
    // Address that defines and controls prestige levels for users.
    address prestige;
    // The Balancer ConfigurableRightsPool that is built for this distribution.
    address crp;
    // The Balancer pool that holds and trades tokens during the distribution.
    address pool;
}

/// High level state of the distribution.
/// An amalgamation of the phases and states of the internal contracts.
enum DistributionStatus {
    // Trust is created but does not have reserve funds required to start the distribution.
    Pending,
    // Trust has enough reserve funds to start the distribution.
    Seeded,
    // The balancer pool is funded and trading.
    Trading,
    // The last block of the balancer pool gradual weight changes is in the past.
    TradingCanEnd,
    // The balancer pool liquidity has been removed and distribution is successful.
    Success,
    // The balancer pool liquidity has been removed and distribution is a failure.
    Fail
}

/// High level stats of the current state of the distribution.
/// Includes the `DistributionStatus` and key configuration and metrics.
struct DistributionProgress {
    // `DistributionStatus` as above.
    DistributionStatus distributionStatus;
    // First block that the distribution can be traded.
    // Will be `0` before trading.
    uint32 distributionStartBlock;
    // First block that the distribution can be ended.
    // Will be `0` before trading.
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
    RedeemableERC20 redeemableERC20;
    RedeemableERC20Pool redeemableERC20Pool;
    // Address of the creator who will receive reserve assets on successful distribution.
    address creator;
    // Minimum amount to raise for the creator from the distribution period.
    // A successful distribution raises at least this AND also the seed fee and redeemInit;
    // On success the creator receives these funds.
    // On failure the creator receives `0`.
    uint256 minimumCreatorRaise;
    // Either an EOA (externally owned address) or `address(0)`.
    // If an EOA the seeder account must transfer seed funds to the newly constructed `Trust` before distribution can start.
    // If `address(0)` a new `SeedERC20` contract is built in the `Trust` constructor.
    address seeder;
    // The reserve amount that seeders receive in addition to what they contribute IFF the raise is successful.
    // An absolute value, so percentages etc. must be calculated off-chain and passed in to the constructor.
    uint256 seederFee;
    // Number of units minted by the newly built `SeedERC20` contract.
    // IGNORED IF the `seeder` contract is an EOA.
    uint16 seederUnits;
    // Cooldown duration of the newly built `SeedERC20` contract.
    // IGNORED IF the `seeder` contract is an EOA.
    uint16 seederCooldownDuration;
    // Minimum duration IN BLOCKS of the trading on Balancer.
    // The trading does not stop until the `anonEndDistribution` function is called.
    uint256 minimumTradingDuration;
    // The amount of reserve to back the redemption initially after trading finishes.
    // Anyone can send more of the reserve to the redemption token at any time to increase redemption value.
    // Successful the redeemInit is sent to token holders, otherwise the failed raise is refunded instead.
    uint256 redeemInit;
}

/// @title Trust
/// Mediates stakeholders and creates internal Balancer pools and tokens for a distribution.
/// The goals of a distribution:
/// - Mint and distribute a `RedeemableERC20` as fairly as possible, prioritising true fans of a creator.
/// - Raise a minimum reserve so that a creator can deliver value to fans.
/// - Provide a safe space through membership style filters to enhance exclusivity for fans.
/// - Ensure that anyone who seeds the raise (not fans) by risking and providing capital is compensated.
///
/// Stakeholders:
/// - Creator: Have a project of interest to their fans
/// - Fans: Will purchase project-specific tokens to receive future rewards from the creator
/// - Seeder(s): Provide initial reserve assets to seed a Balancer trading pool
/// - Deployer: Configures and deploys the `Trust` contract
///
/// The creator is nominated to receive reserve assets on a successful distribution.
/// The creator must complete the project and fans receive rewards.
/// There is no on-chain mechanism to hold the creator accountable to the project completion.
/// Requires a high degree of trust between creator and their fans.
///
/// Fans are willing to trust and provide funds to a creator to complete a project.
/// Fans likely expect some kind of reward or "perks" from the creator, such as NFTs, exclusive events, etc.
/// The distributed tokens are untransferable after trading ends and merely act as records for who should receive rewards.
///
/// Seeders add the initial reserve asset to the Balancer pool to start the automated market maker (AMM).
/// Ideally this would not be needed at all.
/// Future versions of `Trust` may include a bespoke distribution mechanism rather than Balancer contracts.
/// Currently it is required by Balancer so the seeder provides some reserve and receives a fee on successful distribution.
/// If the distribution fails the seeder is returned their initial reserve assets.
/// The seeder is expected to promote and mentor the creator in non-financial ways.
///
/// The deployer has no specific priviledge or admin access once the `Trust` is deployed.
/// They provide the configuration, including nominating creator/seeder, and pay gas but that is all.
/// The deployer defines the conditions under which the distribution is successful.
/// The seeder/creator could also act as the deployer.
///
/// Importantly the `Trust` contract is the owner/admin of the contracts it creates.
/// The `Trust` never transfers ownership so it directly controls all internal workflows.
/// No stakeholder, even the deployer or creator, can act as owner of the internals.
/// There is one function `creatorAddRedeemable` on the `Trust` with a simple access check locked to the creator defined at construction.
contract Trust is ReentrancyGuard {

    using SafeMath for uint256;
    using Math for uint256;

    using SafeERC20 for IERC20;
    using SafeERC20 for RedeemableERC20;

    /// Config the Trust was constructed with.
    TrustConfig public config;

    /// Balance of the reserve asset in the Balance pool at the moment `anonEndDistribution` is called.
    /// This must be greater than or equal to `successBalance` for the distribution to succeed.
    /// Will be uninitialized until `anonEndDistribution` is called.
    /// Note the finalBalance includes the dust that is permanently locked in the Balancer pool after the distribution.
    /// The actual distributed amount will lose roughly 10 ** -7 times this as locked dust.
    /// The exact dust can be retrieved by inspecting the reserve balance of the Balancer pool after the distribution.
    uint256 public finalBalance;
    /// Pool reserveInit + seederFee + redeemInit + minimumCreatorRaise.
    /// Could be calculated as a view function but that would require external calls to the pool contract.
    uint256 public successBalance;

    /// Sanity checks configuration.
    /// Creates the `RedeemableERC20` contract and mints the redeemable ERC20 token.
    /// Creates the `RedeemableERC20Pool` contract.
    /// (optional) Creates the `SeedERC20` contract. Pass a non-zero address to bypass this.
    /// Adds the Balancer pool contracts to the token sender/receiver lists as needed.
    /// Adds the Balancer pool reserve asset as the first redeemable on the `RedeemableERC20` contract.
    ///
    /// Note on slither:
    /// Slither detects a benign reentrancy in this constructor.
    /// However reentrancy is not possible in a contract constructor.
    /// Further discussion with the slither team: https://github.com/crytic/slither/issues/887
    ///
    /// @param config_ Config for the Trust.
    constructor (
        TrustConfig memory config_
    ) public {
        require(config_.creator != address(0), "CREATOR_0");
        // There are additional minimum reserve init and token supply restrictions enforced by `RedeemableERC20` and `RedeemableERC20Pool`.
        // This ensures that the weightings and valuations will be in a sensible range according to the internal assumptions made by Balancer etc.
        require(config_.redeemableERC20.totalSupply() >= config_.redeemableERC20Pool.reserveInit(), "MIN_TOKEN_SUPPLY");

        successBalance = config_.redeemableERC20Pool.reserveInit().add(config_.seederFee).add(config_.redeemInit).add(config_.minimumCreatorRaise);
        require(config_.redeemableERC20Pool.weightValuation(config_.redeemableERC20Pool.finalWeight()) >= successBalance, "MIN_FINAL_VALUATION");

        config = config_;

        if (config.seeder == address(0)) {
            require(config_.redeemableERC20Pool.reserveInit().mod(config.seederUnits) == 0, "SEED_PRICE_MULTIPLIER");
            config.seeder = address(new SeedERC20(SeedERC20Config(
                config_.redeemableERC20Pool.reserve(),
                address(config_.redeemableERC20Pool),
                // seed price.
                config_.redeemableERC20Pool.reserveInit().div(config.seederUnits),
                config.seederUnits,
                config.seederCooldownDuration,
                "",
                ""
            )));
        }

        // Need to grant transfers for a few balancer addresses to facilitate exits.
        config.redeemableERC20.grantRole(config.redeemableERC20.RECEIVER(), address(config_.redeemableERC20Pool.crp().bFactory()));
        config.redeemableERC20.grantRole(config.redeemableERC20.RECEIVER(), address(config_.redeemableERC20Pool.crp()));
        config.redeemableERC20.grantRole(config.redeemableERC20.RECEIVER(), address(config_.redeemableERC20Pool));
        config.redeemableERC20.grantRole(config.redeemableERC20.SENDER(), address(config_.redeemableERC20Pool.crp()));

        // The pool reserve must always be one of the redeemable assets.
        config.redeemableERC20.adminAddRedeemable(config_.redeemableERC20Pool.reserve());

        // Send all tokens to the pool immediately.
        // When the seed funds are raised `anonStartDistribution` will build a pool from these.
        config.redeemableERC20.safeTransfer(address(config_.redeemableERC20Pool), config.redeemableERC20.totalSupply());
    }

    /// Accessor for the `TrustContracts` of this `Trust`.
    function getContracts() external view returns(TrustContracts memory) {
        return TrustContracts(
            address(config.redeemableERC20Pool.reserve()),
            address(config.redeemableERC20),
            address(config.redeemableERC20Pool),
            address(config.seeder),
            address(config.redeemableERC20.prestige()),
            address(config.redeemableERC20Pool.crp()),
            address(config.redeemableERC20Pool.crp().bPool())
        );
    }

    /// Accessor for the `DistributionProgress` of this `Trust`.
    function getDistributionProgress() external view returns(DistributionProgress memory) {
        address balancerPool_ = address(config.redeemableERC20Pool.crp().bPool());
        uint256 poolReserveBalance_;
        uint256 poolTokenBalance_;
        if (balancerPool_ != address(0)) {
            poolReserveBalance_ = config.redeemableERC20Pool.reserve().balanceOf(balancerPool_);
            poolTokenBalance_ = config.redeemableERC20.balanceOf(balancerPool_);
        }
        else {
            poolReserveBalance_ = 0;
            poolTokenBalance_ = 0;
        }

        return DistributionProgress(
            getDistributionStatus(),
            config.redeemableERC20Pool.phaseBlocks(0),
            config.redeemableERC20Pool.phaseBlocks(1),
            poolReserveBalance_,
            poolTokenBalance_,
            config.redeemableERC20Pool.reserveInit(),
            config.minimumCreatorRaise,
            config.seederFee,
            config.redeemInit
        );
    }

    /// Accessor for the `DistributionStatus` of this `Trust`.
    function getDistributionStatus() public view returns (DistributionStatus) {
        Phase poolPhase_ = config.redeemableERC20Pool.currentPhase();
        if (poolPhase_ == Phase.ZERO) {
            if (config.redeemableERC20Pool.reserve().balanceOf(address(config.redeemableERC20Pool)) >= config.redeemableERC20Pool.reserveInit()) {
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
    }

    /// Allow the creator to add a redeemable erc20 to the internal `RedeemableERC20` token.
    /// This is a thin wrapper that proxies the creator to act as the admin for this function call.
    /// @param redeemable_ Redeemable erc20 passed directly to `adminAddRedeemable`.
    function creatorAddRedeemable(IERC20 redeemable_) external {
        // Not using the Open Zepplin RBAC system here as it would be overkill for this one check.
        // This contract has no other access controls.
        require(msg.sender == config.creator, "NOT_CREATOR");
        config.redeemableERC20.adminAddRedeemable(redeemable_);
    }

    /// Anyone can start the distribution.
    /// The requirement is that BOTH the reserve and redeemable tokens have already been sent to the Balancer pool.
    /// If the pool has the required funds it will set the weight curve and start the dutch auction.
    function anonStartDistribution() external {
        config.redeemableERC20Pool.ownerStartDutchAuction(block.number + config.minimumTradingDuration);
    }

    /// Anyone can end the distribution.
    /// The requirement is that the `minimumTradingDuration` has elapsed.
    /// If the `successBalance` is reached then the creator receives the raise and seeder earns a fee.
    /// Else the initial reserve is refunded to the seeder and sale proceeds rolled forward to token holders (not the creator).
    function anonEndDistribution() external nonReentrant {
        finalBalance = config.redeemableERC20Pool.reserve().balanceOf(address(config.redeemableERC20Pool.crp().bPool()));

        config.redeemableERC20Pool.ownerEndDutchAuction();
        // Burning the distributor moves the token to its `Phase.ONE` and unlocks redemptions.
        // The distributor is the `bPool` itself.
        config.redeemableERC20.adminBurnDistributor(
            address(config.redeemableERC20Pool.crp().bPool())
        );

        // Balancer traps a tiny amount of reserve in the pool when it exits.
        uint256 poolDust_ = config.redeemableERC20Pool.reserve().balanceOf(address(config.redeemableERC20Pool.crp().bPool()));
        // The dust is included in the final balance for UX reasons.
        // We don't want to fail the raise due to dust, even if technically it was a failure.
        // To ensure a good UX for creators and token holders we subtract the dust from the seeder.
        uint256 availableBalance_ = config.redeemableERC20Pool.reserve().balanceOf(address(this));

        // Base payments for each fundraiser.
        uint256 seederPay_ = config.redeemableERC20Pool.reserveInit().sub(poolDust_);
        uint256 creatorPay_ = 0;

        // Set aside the redemption and seed fee if we reached the minimum.
        if (finalBalance >= successBalance) {
            // The seeder gets an additional fee on success.
            seederPay_ = seederPay_.add(config.seederFee);

            // The creators get new funds raised minus redeem and seed fees.
            // Can subtract without underflow due to the inequality check for this code block.
            // Proof (assuming all positive integers):
            // final balance >= success balance
            // AND seed pay = seed init + seed fee
            // AND success balance = seed init + seed fee + token pay + min raise
            // SO success balance = seed pay + token pay + min raise
            // SO success balance >= seed pay + token pay
            // SO success balance - (seed pay + token pay) >= 0
            // SO final balance - (seed pay + token pay) >= 0
            //
            // Implied is the remainder of finalBalance_ as redeemInit
            // This will be transferred to the token holders below.
            creatorPay_ = availableBalance_.sub(seederPay_.add(config.redeemInit));
        }

        if (creatorPay_ > 0) {
            config.redeemableERC20Pool.reserve().safeTransfer(
                config.creator,
                creatorPay_
            );
        }

        config.redeemableERC20Pool.reserve().safeTransfer(
            config.seeder,
            seederPay_
        );

        // Send everything left to the token holders.
        // Implicitly the remainder of the finalBalance_ is:
        // - the redeem init if successful
        // - whatever users deposited in the AMM if unsuccessful
        uint256 remainder_ = config.redeemableERC20Pool.reserve().balanceOf(address(this));
        if (remainder_ > 0) {
            config.redeemableERC20Pool.reserve().safeTransfer(
                address(config.redeemableERC20),
                remainder_
            );
        }
    }
}