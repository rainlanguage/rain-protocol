// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { CRPFactory } from "./configurable-rights-pool/contracts/CRPFactory.sol";
import { BFactory } from "./configurable-rights-pool/contracts/test/BFactory.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import { Factory } from "./Factory.sol";
import { Trust, TrustConfig } from "./Trust.sol";
import { RedeemableERC20Factory } from "./RedeemableERC20Factory.sol";
import { RedeemableERC20, RedeemableERC20Config } from "./RedeemableERC20.sol";
import { RedeemableERC20PoolFactory } from "./RedeemableERC20PoolFactory.sol";
import { RedeemableERC20Pool, RedeemableERC20PoolConfig } from "./RedeemableERC20Pool.sol";
import { SeedERC20Factory } from "./SeedERC20Factory.sol";
import { SeedERC20Config } from "./SeedERC20.sol";

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

    TrustFactoryConfig public config;

    constructor(TrustFactoryConfig memory config_) public {
        config = config_;
    }

    function createChild(
        TrustFactoryTrustConfig calldata trustFactoryTrustConfig_,
        RedeemableERC20Config calldata redeemableERC20Config_,
        TrustFactoryRedeemableERC20PoolConfig calldata trustFactoryRedeemableERC20PoolConfig_,
        TrustFactorySeedERC20Config calldata trustFactorySeedERC20Config_
    ) external returns(address) {
        return this.createChild(abi.encode(
            trustFactoryTrustConfig_,
            redeemableERC20Config_,
            trustFactoryRedeemableERC20PoolConfig_,
            trustFactorySeedERC20Config_
        ));
    }

    function _createChild(
        bytes calldata data_
    ) internal virtual override returns(address) {
        (
            TrustFactoryTrustConfig memory trustFactoryTrustConfig_,
            RedeemableERC20Config memory redeemableERC20Config_,
            TrustFactoryRedeemableERC20PoolConfig memory trustFactoryRedeemableERC20PoolConfig_,
            TrustFactorySeedERC20Config memory trustFactorySeedERC20Config_
        ) = abi.decode(
            data_,
            (
                TrustFactoryTrustConfig,
                RedeemableERC20Config,
                TrustFactoryRedeemableERC20PoolConfig,
                TrustFactorySeedERC20Config
            )
        );
        RedeemableERC20 redeemableERC20_ = RedeemableERC20(config.redeemableERC20Factory.createChild(abi.encode(redeemableERC20Config_)));
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
        return address(new Trust(TrustConfig(
            redeemableERC20_,
            redeemableERC20Pool_,
            trustFactoryTrustConfig_.creator,
            trustFactoryTrustConfig_.minimumCreatorRaise,
            trustFactoryTrustConfig_.seeder,
            trustFactoryTrustConfig_.seederFee,
            trustFactoryTrustConfig_.minimumTradingDuration,
            trustFactoryTrustConfig_.redeemInit
        )));
    }
}