// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "./IFactory.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// solhint-disable-next-line max-line-length
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../tier/ITierV2.sol";

struct CurationFeeConfig {
    address token;
    uint256 amount;
    address curator;
}

struct CurationTierConfig {
    address tierContract;
    uint256 minimumTier;
    uint256[] context;
}

struct CurationConfig {
    address factory;
    CurationFeeConfig feeConfig;
    CurationTierConfig tierConfig;
}

contract FactoryCurator {
    using SafeERC20 for IERC20;

    event RegisterConfig(
        address sender,
        uint registryId,
        CurationConfig config
    );

    uint256 private nextRegistryId = 1;
    mapping(uint256 => bytes32) private curationConfigRegistry;

    function registerConfig(CurationConfig calldata config_)
        external
        returns (uint256 registryId_)
    {
        registryId_ = nextRegistryId;
        curationConfigRegistry[registryId_] = keccak256(abi.encode(config_));
        unchecked {
            nextRegistryId = registryId_ + 1;
        }
        emit RegisterConfig(msg.sender, registryId_, config_);
    }

    function createChild(
        uint256 configId_,
        CurationConfig calldata config_,
        bytes calldata createChild_
    ) external returns (address child_) {
        require(
            curationConfigRegistry[configId_] == keccak256(abi.encode(config_)),
            "NOT_IN_REGISTRY"
        );
        require(
            ITierV2(config_.tierConfig.tierContract).reportTimeForTier(
                msg.sender,
                config_.tierConfig.minimumTier,
                config_.tierConfig.context
            ) <= block.timestamp,
            "MINIMUM_TIER"
        );
        IERC20(config_.feeConfig.token).safeTransferFrom(
            msg.sender,
            config_.feeConfig.curator,
            config_.feeConfig.amount
        );
        child_ = IFactory(config_.factory).createChild(createChild_);
    }
}
