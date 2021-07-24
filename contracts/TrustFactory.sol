// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { Factory } from "./Factory.sol";
import { Trust, TrustConfig, TrustRedeemableERC20PoolConfig } from "./Trust.sol";
import { RedeemableERC20Factory } from "./RedeemableERC20Factory.sol";
import { RedeemableERC20, RedeemableERC20Config } from "./RedeemableERC20.sol";

struct TrustFactoryConfig {
    RedeemableERC20Factory redeemableERC20Factory;
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

contract TrustFactory is Factory {
    TrustFactoryConfig public config;
    constructor(TrustFactoryConfig memory config_) public {
        config = config_;
    }

    function _createChild(
        bytes calldata data_
    ) internal virtual override returns(address) {
        (TrustFactoryTrustConfig memory trustFactoryTrustConfig_, RedeemableERC20Config memory redeemableERC20Config_, TrustRedeemableERC20PoolConfig memory trustRedeemableERC20PoolConfig_) = abi.decode(data_, (TrustFactoryTrustConfig, RedeemableERC20Config, TrustRedeemableERC20PoolConfig));
        RedeemableERC20 redeemableERC20_ = RedeemableERC20(config.redeemableERC20Factory.createChild(abi.encode(redeemableERC20Config_)));
        return address(new Trust(TrustConfig(
            redeemableERC20_,
            trustFactoryTrustConfig_.creator,
            trustFactoryTrustConfig_.minimumCreatorRaise,
            trustFactoryTrustConfig_.seeder,
            trustFactoryTrustConfig_.seederFee,
            trustFactoryTrustConfig_.seederUnits,
            trustFactoryTrustConfig_.seederCooldownDuration,
            trustFactoryTrustConfig_.minimumTradingDuration,
            trustFactoryTrustConfig_.redeemInit
        ), trustRedeemableERC20PoolConfig_));
    }
}