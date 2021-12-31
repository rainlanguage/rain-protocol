// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ITier } from "../tier/ITier.sol";

import { Factory } from "../factory/Factory.sol";
import { Trust, TrustConfig } from "../trust/Trust.sol";
// solhint-disable-next-line max-line-length
import { RedeemableERC20Factory } from "../redeemableERC20/RedeemableERC20Factory.sol";
// solhint-disable-next-line max-line-length
import { RedeemableERC20, RedeemableERC20Config } from "../redeemableERC20/RedeemableERC20.sol";
// solhint-disable-next-line max-line-length
import { SeedERC20Factory } from "../seed/SeedERC20Factory.sol";
// solhint-disable-next-line max-line-length
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
// solhint-disable-next-line max-line-length
import { TrustRedeemableERC20Config, TrustSeedERC20Config } from "./Trust.sol";
import { BPoolFeeEscrow } from "../escrow/BPoolFeeEscrow.sol";
import { ERC20Config } from "../erc20/ERC20Config.sol";

/// Everything required to construct a `TrustFactory`.
struct TrustFactoryConfig {
    /// The RedeemableERC20Factory on the current network.
    /// This is an address published by Beehive Trust or deployed locally
    /// during testing.
    RedeemableERC20Factory redeemableERC20Factory;
    /// The SeedERC20Factory on the current network.
    /// This is an address published by Beehive Trust or deployed locally
    /// during testing.
    SeedERC20Factory seedERC20Factory;
    /// Every `Trust` built by this factory will use this Balancer CRP factory.
    address crpFactory;
    /// Every `Trust` built by this factory will use this Balancer factory.
    address balancerFactory;
    /// Every `Trust` built by this factory will use this funds release
    /// timeout.
    uint creatorFundsReleaseTimeout;
    /// Every `Trust` built by this factory will have its raise duration
    /// limited by this max duration.
    uint maxRaiseDuration;
}

/// Partial config for `TrustConfig`.
struct TrustFactoryTrustConfig {
    IERC20 reserve;
    uint reserveInit;
    uint initialValuation;
    uint finalValuation;
    uint minimumTradingDuration;
    address creator;
    uint minimumCreatorRaise;
    uint seederFee;
    uint redeemInit;
}

/// Partial config for `TrustRedeemableERC20Config`.
struct TrustFactoryTrustRedeemableERC20Config {
    ERC20Config erc20Config;
    ITier tier;
    uint minimumTier;
    uint totalSupply;
}

/// Partial config for `TrustRedeemableERC20PoolConfig`.
struct TrustFactoryTrustSeedERC20Config {
    address seedERC20Factory;
    address seeder;
    uint seederUnits;
    uint seederCooldownDuration;
    ERC20Config seedERC20Config;
}

/// @title TrustFactory
/// @notice The `TrustFactory` contract is the only contract that the
/// deployer uses to deploy all contracts for a single project
/// fundraising event. It takes references to
/// `RedeemableERC20Factory`, `RedeemableERC20PoolFactory` and
/// `SeedERC20Factory` contracts, and builds a new `Trust` contract.
/// @dev Factory for creating and registering new Trust contracts.
contract TrustFactory is Factory {
    using SafeERC20 for RedeemableERC20;

    RedeemableERC20Factory public immutable redeemableERC20Factory;
    SeedERC20Factory public immutable seedERC20Factory;
    address public immutable crpFactory;
    address public immutable balancerFactory;
    uint public immutable creatorFundsReleaseTimeout;
    uint public immutable maxRaiseDuration;
    BPoolFeeEscrow public immutable bPoolFeeEscrow;

    /// @param config_ All configuration for the `TrustFactory`.
    constructor(TrustFactoryConfig memory config_) {
        redeemableERC20Factory = config_.redeemableERC20Factory;
        seedERC20Factory = config_.seedERC20Factory;
        crpFactory = config_.crpFactory;
        balancerFactory = config_.balancerFactory;
        creatorFundsReleaseTimeout = config_.creatorFundsReleaseTimeout;
        maxRaiseDuration = config_.maxRaiseDuration;
        bPoolFeeEscrow = new BPoolFeeEscrow(address(this));
    }

    /// Allows calling `createChild` with TrustConfig,
    /// TrustRedeemableERC20Config and
    /// TrustRedeemableERC20PoolConfig parameters.
    /// Can use original Factory `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param trustFactoryTrustConfig_ Trust constructor configuration.
    /// @param trustFactoryTrustRedeemableERC20Config_ RedeemableERC20
    /// constructor configuration.
    /// @param trustFactoryTrustSeedERC20Config_ SeedERC20
    /// constructor configuration.
    /// @return New Trust child contract address.
    function createChild(
        TrustFactoryTrustConfig
        calldata
        trustFactoryTrustConfig_,
        TrustFactoryTrustRedeemableERC20Config
        calldata
        trustFactoryTrustRedeemableERC20Config_,
        TrustFactoryTrustSeedERC20Config
        calldata
        trustFactoryTrustSeedERC20Config_
    ) external returns(address) {
        return this.createChild(abi.encode(
            trustFactoryTrustConfig_,
            trustFactoryTrustRedeemableERC20Config_,
            trustFactoryTrustSeedERC20Config_
        ));
    }

    /// @inheritdoc Factory
    function _createChild(
        bytes calldata data_
    ) internal virtual override returns(address) {
        (
            TrustFactoryTrustConfig
            memory
            trustFactoryTrustConfig_,
            TrustFactoryTrustRedeemableERC20Config
            memory
            trustFactoryTrustRedeemableERC20Config_,
            TrustFactoryTrustSeedERC20Config
            memory
            trustFactoryTrustSeedERC20Config_
        ) = abi.decode(
            data_,
            (
                TrustFactoryTrustConfig,
                TrustFactoryTrustRedeemableERC20Config,
                TrustFactoryTrustSeedERC20Config
            )
        );

        require(
            trustFactoryTrustConfig_.minimumTradingDuration
                <= maxRaiseDuration,
            "MAX_RAISE_DURATION"
        );

        return address(new Trust(
            TrustConfig(
                bPoolFeeEscrow,
                crpFactory,
                balancerFactory,
                trustFactoryTrustConfig_.reserve,
                trustFactoryTrustConfig_.reserveInit,
                trustFactoryTrustConfig_.initialValuation,
                trustFactoryTrustConfig_.finalValuation,
                trustFactoryTrustConfig_.minimumTradingDuration,
                trustFactoryTrustConfig_.creator,
                creatorFundsReleaseTimeout,
                trustFactoryTrustConfig_.minimumCreatorRaise,
                trustFactoryTrustConfig_.seederFee,
                trustFactoryTrustConfig_.redeemInit
            ),
            TrustRedeemableERC20Config(
                redeemableERC20Factory,
                trustFactoryTrustRedeemableERC20Config_.erc20Config,
                trustFactoryTrustRedeemableERC20Config_.tier,
                trustFactoryTrustRedeemableERC20Config_.minimumTier,
                trustFactoryTrustRedeemableERC20Config_.totalSupply
            ),
            TrustSeedERC20Config(
                seedERC20Factory,
                trustFactoryTrustSeedERC20Config_.seeder,
                trustFactoryTrustSeedERC20Config_.seederUnits,
                trustFactoryTrustSeedERC20Config_.seederCooldownDuration,
                trustFactoryTrustSeedERC20Config_.seedERC20Config
            )
        ));
    }
}