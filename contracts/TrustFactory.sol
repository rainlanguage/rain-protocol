// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import { IPrestige } from "./tv-prestige/contracts/IPrestige.sol";

import { Factory } from "./Factory.sol";
import { Trust, TrustConfig } from "./Trust.sol";
import { RedeemableERC20Factory } from "./RedeemableERC20Factory.sol";
import { RedeemableERC20, RedeemableERC20Config } from "./RedeemableERC20.sol";
import { RedeemableERC20PoolFactory } from "./RedeemableERC20PoolFactory.sol";
import {
    RedeemableERC20Pool,
    RedeemableERC20PoolConfig
} from "./RedeemableERC20Pool.sol";
import { SeedERC20Factory } from "./SeedERC20Factory.sol";
import { SeedERC20Config } from "./SeedERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { TrustRedeemableERC20Config, TrustRedeemableERC20PoolConfig } from "./Trust.sol";

struct TrustFactoryConfig {
    RedeemableERC20Factory redeemableERC20Factory;
    RedeemableERC20PoolFactory redeemableERC20PoolFactory;
    SeedERC20Factory seedERC20Factory;
}

struct TrustFactoryTrustConfig {
    address creator;
    uint256 minimumCreatorRaise;
    address seeder;
    uint256 seederFee;
    uint16 seederUnits;
    uint16 seederCooldownDuration;
    uint256 minimumTradingDuration;
    uint256 redeemInit;
}

struct TrustFactoryTrustRedeemableERC20Config {
    string name;
    string symbol;
    IPrestige prestige;
    IPrestige.Status minimumStatus;
    uint256 totalSupply;
}

struct TrustFactoryTrustRedeemableERC20PoolConfig {
    IERC20 reserve;
    uint256 reserveInit;
    uint256 initialValuation;
    uint256 finalValuation;
}

contract TrustFactory is Factory {
    using SafeMath for uint256;
    using SafeERC20 for RedeemableERC20;

    RedeemableERC20Factory public immutable redeemableERC20Factory;
    RedeemableERC20PoolFactory public immutable redeemableERC20PoolFactory;
    SeedERC20Factory public immutable seedERC20Factory;

    constructor(TrustFactoryConfig memory config_) public {
        redeemableERC20Factory = config_.redeemableERC20Factory;
        redeemableERC20PoolFactory = config_.redeemableERC20PoolFactory;
        seedERC20Factory = config_.seedERC20Factory;
    }

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
                trustFactoryTrustConfig_.minimumTradingDuration,
                trustFactoryTrustConfig_.redeemInit
            ),
            TrustRedeemableERC20Config(
                redeemableERC20Factory,
                trustFactoryTrustRedeemableERC20Config_.name,
                trustFactoryTrustRedeemableERC20Config_.symbol,
                trustFactoryTrustRedeemableERC20Config_.prestige,
                trustFactoryTrustRedeemableERC20Config_.minimumStatus,
                trustFactoryTrustRedeemableERC20Config_.totalSupply
            ),
            TrustRedeemableERC20PoolConfig(
                redeemableERC20PoolFactory,
                trustFactoryTrustRedeemableERC20PoolConfig_.reserve,
                trustFactoryTrustRedeemableERC20PoolConfig_.reserveInit,
                trustFactoryTrustRedeemableERC20PoolConfig_.initialValuation,
                trustFactoryTrustRedeemableERC20PoolConfig_.finalValuation
            )
        ));

        return trust_;
    }
}