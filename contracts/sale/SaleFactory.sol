// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {Factory} from "../factory/Factory.sol";
import "./Sale.sol";

import "@openzeppelin/contracts/proxy/Clones.sol";

struct SaleSeriesConfig {
    uint256 seriesId;
    uint256 seriesLength;
    uint256 seriesIndex;
}

struct SaleFactorySaleConfig {
    SaleSeriesConfig saleSeriesConfig;
    SaleConfig saleConfig;
    SaleRedeemableERC20Config saleRedeemableERC20Config;
}

/// @title SaleFactory
/// @notice Factory for creating and deploying `Sale` contracts.
contract SaleFactory is Factory {
    /// Template contract to clone.
    /// Deployed by the constructor.
    address private immutable implementation;

    /// Build the reference implementation to clone for each child.
    constructor(SaleConstructorConfig memory config_) {
        address implementation_ = address(new Sale(config_));
        // silence slither.
        require(implementation_ != address(0), "0_IMPLEMENTATION");
        emit Implementation(msg.sender, implementation_);
        implementation = implementation_;
    }

    /// @inheritdoc Factory
    function _createChild(bytes calldata data_)
        internal
        virtual
        override
        returns (address)
    {
        SaleFactorySaleConfig memory saleFactorySaleConfig_ = abi.decode(
            data_,
            (SaleFactorySaleConfig)
        );
        require(
            saleFactorySaleConfig_.saleSeriesConfig.seriesIndex <
                saleFactorySaleConfig_.saleSeriesConfig.seriesLength,
            "SERIES_OOB"
        );

        uint256 baseSalt_ = uint256(
            keccak256(
                abi.encodePacked(
                    // include the sender so that each sender has their own
                    // universe of possible sales to deploy.
                    msg.sender,
                    // include series id and length so every sale with the same
                    // base salt has the same opinion on the series shape.
                    saleFactorySaleConfig_.saleSeriesConfig.seriesId,
                    saleFactorySaleConfig_.saleSeriesConfig.seriesLength
                )
            )
        );
        bytes32 salt_ = bytes32(
            baseSalt_ + saleFactorySaleConfig_.saleSeriesConfig.seriesIndex
        );

        address clone_ = Clones.cloneDeterministic(implementation, salt_);
        Sale(clone_).initialize(
            saleFactorySaleConfig_.saleConfig,
            saleFactorySaleConfig_.saleRedeemableERC20Config
        );
        return clone_;
    }

    /// Allows calling `createChild` with `SeedERC20Config` struct.
    /// Use original `Factory` `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ `SeedERC20` constructor configuration.
    /// @return New `SeedERC20` child contract.
    function createChildTyped(
        uint256 seriesId_,
        SaleConfig calldata config_,
        SaleRedeemableERC20Config calldata saleRedeemableERC20Config_
    ) external returns (Sale) {
        return
            Sale(
                this.createChild(
                    abi.encode(seriesId_, config_, saleRedeemableERC20Config_)
                )
            );
    }
}
