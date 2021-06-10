// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.6.6;

pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";

import { RedeemableERC20Factory, Config as RedeemableERC20FactoryConfig } from "./RedeemableERC20Factory.sol";
import { Config as RedeemableERC20PoolConfig } from "./RedeemableERC20Pool.sol";
import { RedeemableERC20PoolFactory } from "./RedeemableERC20PoolFactory.sol";
import { Trust, Config as InnerTrustConfig, PoolConfig as InnerPoolConfig } from "./Trust.sol";
import { SeedERC20Factory } from "./SeedERC20Factory.sol";
import { Config as SeedERC20Config, SeedERC20 } from "./SeedERC20.sol";

import { CRPFactory } from "./configurable-rights-pool/contracts/CRPFactory.sol";
import { BFactory } from "./configurable-rights-pool/contracts/test/BFactory.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

struct Config {
    SeedERC20Factory seedERC20Factory;
    RedeemableERC20Factory redeemableERC20Factory;
    RedeemableERC20PoolFactory redeemableERC20PoolFactory;
    CRPFactory crpFactory;
    BFactory balancerFactory;
}

struct SeedConfig {
    string name;
    string symbol;
    address overrideSeeder;
    uint256 seedUnits;
    uint256 unseedDelay;
}

struct TrustConfig {
    IERC20 reserve;
    address creator;
    uint256 minCreatorRaise;
    address seeder;
    uint256 seederFee;
    uint256 raiseDuration;
    uint256 redeemInit;
}

struct PoolConfig {
    uint256 reserveInit;
    uint256 initialValuation;
    uint256 finalValuation;
}

contract TrustFactory {

    using SafeMath for uint256;

    event NewContract(
        address indexed _caller,
        address indexed _contract
    );

    mapping(address => bool) public contracts;

    Config public config;

    constructor (
        Config memory _config
    ) public {
        config = _config;
    }

    function newContract(
        TrustConfig memory _trustConfig,
        RedeemableERC20FactoryConfig memory _redeemableERC20FactoryConfig,
        PoolConfig memory _poolConfig,
        SeedConfig memory _seedConfig
    ) external returns(Trust) {
        SeedERC20 _seedERC20;
        if (_seedConfig.overrideSeeder == address(0)) {
            require(_poolConfig.reserveInit.mod(_seedConfig.seedUnits) == 0, "SEED_PRICE_MULTIPLIER");
            _seedERC20 = config.seedERC20Factory.newContract(SeedERC20Config(
                _trustConfig.reserve,
                // seedPrice
                _poolConfig.reserveInit.div(_seedConfig.seedUnits),
                _seedConfig.seedUnits,
                _seedConfig.unseedDelay,
                _seedConfig.name,
                _seedConfig.symbol
            ));
            _trustConfig.seeder = address(_seedERC20);
        }
        Trust _contract = new Trust(
            InnerTrustConfig(
                config.redeemableERC20Factory,
                config.redeemableERC20PoolFactory,
                _trustConfig.creator,
                _trustConfig.minCreatorRaise,
                _trustConfig.seeder,
                _trustConfig.seederFee,
                _trustConfig.raiseDuration,
                _trustConfig.redeemInit
            ),
            _redeemableERC20FactoryConfig,
            InnerPoolConfig(
                config.crpFactory,
                config.balancerFactory,
                _trustConfig.reserve,
                _poolConfig.reserveInit,
                _poolConfig.initialValuation,
                _poolConfig.finalValuation
        ));
        contracts[address(_contract)] = true;
        emit NewContract(msg.sender, address(_contract));

        // Seed contract needs to be aware of the trust as recipient.
        if (config.seedERC20Factory.contracts(address(_seedERC20))) {
            _seedERC20.init(address(_contract));
        }
        return _contract;
    }
}