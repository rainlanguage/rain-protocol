// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { CRPFactory } from "./configurable-rights-pool/contracts/CRPFactory.sol";
import { BFactory } from "./configurable-rights-pool/contracts/test/BFactory.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import { IPrestige } from "./tv-prestige/contracts/IPrestige.sol";

import { Factory } from "./Factory.sol";
import { Trust, TrustConfig } from "./Trust.sol";
import { RedeemableERC20Factory } from "./RedeemableERC20Factory.sol";
import { RedeemableERC20, RedeemableERC20Config } from "./RedeemableERC20.sol";
import { RedeemableERC20PoolFactory } from "./RedeemableERC20PoolFactory.sol";
import { RedeemableERC20Pool, RedeemableERC20PoolConfig } from "./RedeemableERC20Pool.sol";
import { SeedERC20Factory } from "./SeedERC20Factory.sol";
import { SeedERC20Config } from "./SeedERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

struct TrustFactoryConfig {
    CRPFactory crpFactory;
    BFactory balancerFactory;
    RedeemableERC20Factory redeemableERC20Factory;
    RedeemableERC20PoolFactory redeemableERC20PoolFactory;
    SeedERC20Factory seedERC20Factory;
}

struct TrustFactoryTrustConfig {
    address creator;
    uint256 minimumCreatorRaise;
    address seeder;
    uint256 seederFee;
    uint256 minimumTradingDuration;
    uint256 redeemInit;
}

struct TrustFactoryRedeemableERC20Config {
    string name;
    string symbol;
    IPrestige prestige;
    IPrestige.Status minimumStatus;
    uint256 totalSupply;
}

struct TrustFactoryRedeemableERC20PoolConfig {
    IERC20 reserve;
    uint256 reserveInit;
    uint256 initialValuation;
    uint256 finalValuation;
}

struct TrustFactorySeedERC20Config {
    uint16 seederUnits;
    uint16 seederCooldownDuration;
}

contract TrustFactory is Factory {
    using SafeMath for uint256;
    using SafeERC20 for RedeemableERC20;

    TrustFactoryConfig public config;

    constructor(TrustFactoryConfig memory config_) public {
        config = config_;
    }

    function createChild(
        TrustFactoryTrustConfig calldata trustFactoryTrustConfig_,
        TrustFactoryRedeemableERC20Config calldata trustFactoryRedeemableERC20Config_,
        TrustFactoryRedeemableERC20PoolConfig calldata trustFactoryRedeemableERC20PoolConfig_,
        TrustFactorySeedERC20Config calldata trustFactorySeedERC20Config_
    ) external returns(address) {
        return this.createChild(abi.encode(
            trustFactoryTrustConfig_,
            trustFactoryRedeemableERC20Config_,
            trustFactoryRedeemableERC20PoolConfig_,
            trustFactorySeedERC20Config_
        ));
    }

    function _createChild(
        bytes calldata data_
    ) internal virtual override returns(address) {
        (
            TrustFactoryTrustConfig memory trustFactoryTrustConfig_,
            TrustFactoryRedeemableERC20Config memory trustFactoryRedeemableERC20Config_,
            TrustFactoryRedeemableERC20PoolConfig memory trustFactoryRedeemableERC20PoolConfig_,
            TrustFactorySeedERC20Config memory trustFactorySeedERC20Config_
        ) = abi.decode(
            data_,
            (
                TrustFactoryTrustConfig,
                TrustFactoryRedeemableERC20Config,
                TrustFactoryRedeemableERC20PoolConfig,
                TrustFactorySeedERC20Config
            )
        );
        RedeemableERC20 redeemableERC20_ = RedeemableERC20(config.redeemableERC20Factory.createChild(abi.encode(RedeemableERC20Config(
            address(this),
            trustFactoryRedeemableERC20Config_.name,
            trustFactoryRedeemableERC20Config_.symbol,
            trustFactoryRedeemableERC20Config_.prestige,
            trustFactoryRedeemableERC20Config_.minimumStatus,
            trustFactoryRedeemableERC20Config_.totalSupply
        ))));

        RedeemableERC20Pool redeemableERC20Pool_ = RedeemableERC20Pool(config.redeemableERC20PoolFactory.createChild(abi.encode(RedeemableERC20PoolConfig(
            config.crpFactory,
            config.balancerFactory,
            trustFactoryRedeemableERC20PoolConfig_.reserve,
            redeemableERC20_,
            trustFactoryRedeemableERC20PoolConfig_.reserveInit,
            trustFactoryRedeemableERC20PoolConfig_.initialValuation,
            trustFactoryRedeemableERC20PoolConfig_.finalValuation
        ))));

        if (trustFactoryTrustConfig_.seeder == address(0)) {
            require(redeemableERC20Pool_.reserveInit().mod(trustFactorySeedERC20Config_.seederUnits) == 0, "SEED_PRICE_MULTIPLIER");
            trustFactoryTrustConfig_.seeder = address(config.seedERC20Factory.createChild(abi.encode(SeedERC20Config(
                redeemableERC20Pool_.reserve(),
                address(redeemableERC20Pool_),
                // seed price.
                redeemableERC20Pool_.reserveInit().div(trustFactorySeedERC20Config_.seederUnits),
                trustFactorySeedERC20Config_.seederUnits,
                trustFactorySeedERC20Config_.seederCooldownDuration,
                "",
                ""
            ))));
        }
        address trust_ = address(new Trust(TrustConfig(
            redeemableERC20_,
            redeemableERC20Pool_,
            trustFactoryTrustConfig_.creator,
            trustFactoryTrustConfig_.minimumCreatorRaise,
            trustFactoryTrustConfig_.seeder,
            trustFactoryTrustConfig_.seederFee,
            trustFactoryTrustConfig_.minimumTradingDuration,
            trustFactoryTrustConfig_.redeemInit
        )));

        // Send all tokens to the pool immediately.
        // When the seed funds are raised `anonStartDistribution` on the `Trust` will build a pool from these.
        redeemableERC20_.safeTransfer(address(redeemableERC20Pool_), trustFactoryRedeemableERC20Config_.totalSupply);

        // Need to grant transfers for a few balancer addresses to facilitate exits.
        redeemableERC20_.grantRole(redeemableERC20_.RECEIVER(), address(redeemableERC20Pool_.crp().bFactory()));
        redeemableERC20_.grantRole(redeemableERC20_.RECEIVER(), address(redeemableERC20Pool_.crp()));
        redeemableERC20_.grantRole(redeemableERC20_.RECEIVER(), address(redeemableERC20Pool_));
        redeemableERC20_.grantRole(redeemableERC20_.SENDER(), address(redeemableERC20Pool_.crp()));

        // Need to grant creator ability to add redeemables.
        redeemableERC20_.grantRole(redeemableERC20_.REDEEMABLE_ADDER(), trustFactoryTrustConfig_.creator);

        // The trust needs the ability to burn the distributor.
        redeemableERC20_.grantRole(redeemableERC20_.DISTRIBUTOR_BURNER(), trust_);

        // The pool reserve must always be one of the redeemable assets.
        redeemableERC20_.addRedeemable(trustFactoryRedeemableERC20PoolConfig_.reserve);

        // There is no longer any reason for the redeemableERC20 to have an admin.
        redeemableERC20_.revokeRole(redeemableERC20_.DEFAULT_ADMIN_ROLE(), address(this));

        // The `Trust` needs to own the pool to enable distributions to start.
        redeemableERC20Pool_.transferOwnership(trust_);

        return trust_;
    }
}