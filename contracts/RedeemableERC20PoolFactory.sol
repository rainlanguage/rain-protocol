// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { Factory } from "./Factory.sol";
import {
    RedeemableERC20Pool,
    RedeemableERC20PoolConfig
} from "./RedeemableERC20Pool.sol";
import {
    CRPFactory
} from "./configurable-rights-pool/contracts/CRPFactory.sol";
import {
    BFactory
} from "./configurable-rights-pool/contracts/test/BFactory.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { RedeemableERC20 } from "./RedeemableERC20.sol";

struct RedeemableERC20PoolFactoryConfig {
    CRPFactory crpFactory;
    BFactory balancerFactory;
}

struct RedeemableERC20PoolFactoryRedeemableERC20PoolConfig {
    IERC20 reserve;
    RedeemableERC20 token;
    uint256 reserveInit;
    uint256 initialValuation;
    uint256 finalValuation;
}

contract RedeemableERC20PoolFactory is Factory {
    CRPFactory public immutable crpFactory;
    BFactory public immutable balancerFactory;

    constructor(RedeemableERC20PoolFactoryConfig memory config_) public {
        crpFactory = config_.crpFactory;
        balancerFactory = config_.balancerFactory;
    }

    function _createChild(
        bytes calldata data_
    ) internal virtual override returns(address) {
        (
            RedeemableERC20PoolFactoryRedeemableERC20PoolConfig
            memory
            config_
        ) = abi.decode(
            data_,
            (RedeemableERC20PoolFactoryRedeemableERC20PoolConfig)
        );
        RedeemableERC20Pool pool_ = new RedeemableERC20Pool(
            RedeemableERC20PoolConfig(
                crpFactory,
                balancerFactory,
                config_.reserve,
                config_.token,
                config_.reserveInit,
                config_.initialValuation,
                config_.finalValuation
            )
        );
        pool_.transferOwnership(msg.sender);
        return address(pool_);
    }

    function createChild(
        RedeemableERC20PoolFactoryRedeemableERC20PoolConfig
        calldata
        config_
    )
        external
        returns(address)
    {
        return this.createChild(abi.encode(config_));
    }
}