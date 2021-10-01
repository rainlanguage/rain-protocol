// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import { ITier } from "../tier/ITier.sol";

import { Factory } from "../factory/Factory.sol";
import { Trust, TrustConfig } from "../trust/Trust.sol";
import {
    RedeemableERC20Factory
} from "../redeemableERC20/RedeemableERC20Factory.sol";
import {
    RedeemableERC20, RedeemableERC20Config
} from "../redeemableERC20/RedeemableERC20.sol";
import {
    RedeemableERC20PoolFactory
} from "../pool/RedeemableERC20PoolFactory.sol";
import {
    RedeemableERC20Pool,
    RedeemableERC20PoolConfig
} from "../pool/RedeemableERC20Pool.sol";
import { SeedERC20Factory } from "../seed/SeedERC20Factory.sol";
import { SeedERC20Config } from "../seed/SeedERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {
    TrustRedeemableERC20Config,
    TrustRedeemableERC20PoolConfig
} from "./Trust.sol";

/// Everything required to construct a `TrustFactory`.
struct TrustFactoryConfig {
    // The RedeemableERC20Factory on the current network.
    // This is an address published by Beehive Trust or deployed locally
    // during testing.
    RedeemableERC20Factory redeemableERC20Factory;
    // The RedeemableERC20PoolFactory on the current network.
    // This is an address published by Beehive Trust or deployed locally
    // during testing.
    RedeemableERC20PoolFactory redeemableERC20PoolFactory;
    // The SeedERC20Factory on the current network.
    // This is an address published by Beehive Trust or deployed locally
    // during testing.
    SeedERC20Factory seedERC20Factory;
}

struct TrustFactoryTrustConfig {
    // Address of the creator who will receive reserve assets on successful
    // distribution.
    address creator;
    // Minimum amount to raise for the creator from the distribution period.
    // A successful distribution raises at least this AND also the seed fee and
    // `redeemInit`;
    // On success the creator receives these funds.
    // On failure the creator receives `0`.
    uint256 minimumCreatorRaise;
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
}

struct TrustFactoryTrustRedeemableERC20Config {
    // Name forwarded to ERC20 constructor.
    string name;
    // Symbol forwarded to ERC20 constructor.
    string symbol;
    // Tier contract to compare statuses against on transfer.
    ITier tier;
    // Minimum status required for transfers in `Phase.ZERO`. Can be `0`.
    ITier.Tier minimumStatus;
    // Number of redeemable tokens to mint.
    uint256 totalSupply;
}

struct TrustFactoryTrustRedeemableERC20PoolConfig {
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

/// @title TrustFactory
/// @notice The `TrustFactory` contract is the only contract that the
/// deployer uses to deploy all contracts for a single project
/// fundraising event. It takes references to
/// `RedeemableERC20Factory`, `RedeemableERC20PoolFactory` and
/// `SeedERC20Factory` contracts, and builds a new `Trust` contract.
/// @dev Factory for creating and registering new Trust contracts.
contract TrustFactory is Factory {
    using SafeMath for uint256;
    using SafeERC20 for RedeemableERC20;

    RedeemableERC20Factory public immutable redeemableERC20Factory;
    RedeemableERC20PoolFactory public immutable redeemableERC20PoolFactory;
    SeedERC20Factory public immutable seedERC20Factory;

    /// @param config_ All configuration for the `TrustFactory`.
    constructor(TrustFactoryConfig memory config_) public {
        redeemableERC20Factory = config_.redeemableERC20Factory;
        redeemableERC20PoolFactory = config_.redeemableERC20PoolFactory;
        seedERC20Factory = config_.seedERC20Factory;
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
    /// @param trustFactoryTrustRedeemableERC20PoolConfig_ RedeemableERC20Pool
    /// constructor configuration.
    /// @return New Trust child contract address.
    function createChild(
        TrustFactoryTrustConfig
        calldata
        trustFactoryTrustConfig_,
        TrustFactoryTrustRedeemableERC20Config
        calldata
        trustFactoryTrustRedeemableERC20Config_,
        TrustFactoryTrustRedeemableERC20PoolConfig
        calldata
        trustFactoryTrustRedeemableERC20PoolConfig_
    ) external returns(address) {
        return this.createChild(abi.encode(
            trustFactoryTrustConfig_,
            trustFactoryTrustRedeemableERC20Config_,
            trustFactoryTrustRedeemableERC20PoolConfig_
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
            TrustFactoryTrustRedeemableERC20PoolConfig
            memory
            trustFactoryTrustRedeemableERC20PoolConfig_
        ) = abi.decode(
            data_,
            (
                TrustFactoryTrustConfig,
                TrustFactoryTrustRedeemableERC20Config,
                TrustFactoryTrustRedeemableERC20PoolConfig
            )
        );

        address trust_ = address(new Trust(
            TrustConfig(
                trustFactoryTrustConfig_.creator,
                trustFactoryTrustConfig_.minimumCreatorRaise,
                seedERC20Factory,
                trustFactoryTrustConfig_.seeder,
                trustFactoryTrustConfig_.seederFee,
                trustFactoryTrustConfig_.seederUnits,
                trustFactoryTrustConfig_.seederCooldownDuration,
                trustFactoryTrustConfig_.redeemInit
            ),
            TrustRedeemableERC20Config(
                redeemableERC20Factory,
                trustFactoryTrustRedeemableERC20Config_.name,
                trustFactoryTrustRedeemableERC20Config_.symbol,
                trustFactoryTrustRedeemableERC20Config_.tier,
                trustFactoryTrustRedeemableERC20Config_.minimumStatus,
                trustFactoryTrustRedeemableERC20Config_.totalSupply
            ),
            TrustRedeemableERC20PoolConfig(
                redeemableERC20PoolFactory,
                trustFactoryTrustRedeemableERC20PoolConfig_.reserve,
                trustFactoryTrustRedeemableERC20PoolConfig_.reserveInit,
                trustFactoryTrustRedeemableERC20PoolConfig_.initialValuation,
                trustFactoryTrustRedeemableERC20PoolConfig_.finalValuation,
                trustFactoryTrustRedeemableERC20PoolConfig_
                    .minimumTradingDuration
            )
        ));

        return trust_;
    }
}