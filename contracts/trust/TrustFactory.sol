// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ITier} from "../tier/ITier.sol";

import "@openzeppelin/contracts/proxy/Clones.sol";

import {Factory} from "../factory/Factory.sol";
import {Trust, TrustConstructionConfig, TrustConfig} from "../trust/Trust.sol";
// solhint-disable-next-line max-line-length
import {RedeemableERC20Factory} from "../redeemableERC20/RedeemableERC20Factory.sol";
// solhint-disable-next-line max-line-length
import {RedeemableERC20, RedeemableERC20Config} from "../redeemableERC20/RedeemableERC20.sol";
import {SeedERC20Factory} from "../seed/SeedERC20Factory.sol";
// solhint-disable-next-line max-line-length
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {TrustRedeemableERC20Config, TrustSeedERC20Config} from "./Trust.sol";
import {BPoolFeeEscrow} from "../escrow/BPoolFeeEscrow.sol";
import {ERC20Config} from "../erc20/ERC20Config.sol";

/// @title TrustFactory
/// @notice The `TrustFactory` contract is the only contract that the
/// deployer uses to deploy all contracts for a single project
/// fundraising event. It takes references to
/// `RedeemableERC20Factory`, `RedeemableERC20PoolFactory` and
/// `SeedERC20Factory` contracts, and builds a new `Trust` contract.
/// @dev Factory for creating and registering new Trust contracts.
contract TrustFactory is Factory {
    using SafeERC20 for RedeemableERC20;

    /// Template contract to clone.
    /// Deployed by the constructor.
    address private immutable implementation;

    /// Build the reference implementation to clone for each child.
    /// @param config_ All configuration for the `TrustFactory`.
    constructor(TrustConstructionConfig memory config_) {
        address implementation_ = address(new Trust(config_));
        // This silences slither.
        require(implementation_ != address(0), "TRUST_0");
        emit Implementation(msg.sender, implementation_);
        implementation = implementation_;
    }

    /// Allows calling `createChild` with TrustConfig,
    /// TrustRedeemableERC20Config and
    /// TrustRedeemableERC20PoolConfig parameters.
    /// Can use original Factory `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param trustConfig_ Trust constructor configuration.
    /// @param trustRedeemableERC20Config_ RedeemableERC20
    /// constructor configuration.
    /// @param trustSeedERC20Config_ SeedERC20
    /// constructor configuration.
    /// @return New Trust child contract address.
    function createChildTyped(
        TrustConfig calldata trustConfig_,
        TrustRedeemableERC20Config calldata trustRedeemableERC20Config_,
        TrustSeedERC20Config calldata trustSeedERC20Config_
    ) external returns (Trust) {
        return
            Trust(
                this.createChild(
                    abi.encode(
                        trustConfig_,
                        trustRedeemableERC20Config_,
                        trustSeedERC20Config_
                    )
                )
            );
    }

    /// @inheritdoc Factory
    function _createChild(bytes calldata data_)
        internal
        virtual
        override
        returns (address)
    {
        (
            TrustConfig memory trustConfig_,
            TrustRedeemableERC20Config memory trustRedeemableERC20Config_,
            TrustSeedERC20Config memory trustSeedERC20Config_
        ) = abi.decode(
                data_,
                (TrustConfig, TrustRedeemableERC20Config, TrustSeedERC20Config)
            );

        address clone_ = Clones.clone(implementation);

        Trust(clone_).initialize(
            trustConfig_,
            trustRedeemableERC20Config_,
            trustSeedERC20Config_
        );

        return clone_;
    }
}
