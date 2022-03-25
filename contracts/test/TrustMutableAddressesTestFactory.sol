// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {ITier} from "../tier/ITier.sol";

import "@openzeppelin/contracts/proxy/Clones.sol";

import {Factory} from "../factory/Factory.sol";
import {
    TrustMutableAddressesTest,
    TrustConstructionConfig,
    TrustConfig,
    TrustRedeemableERC20Config,
    TrustSeedERC20Config
} from "./TrustMutableAddressesTest.sol";
// solhint-disable-next-line max-line-length
import {RedeemableERC20Factory} from "../redeemableERC20/RedeemableERC20Factory.sol";
// solhint-disable-next-line max-line-length
import {RedeemableERC20, RedeemableERC20Config} from "../redeemableERC20/RedeemableERC20.sol";
import {SeedERC20Factory} from "../seed/SeedERC20Factory.sol";
// solhint-disable-next-line max-line-length
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {BPoolFeeEscrow} from "../escrow/BPoolFeeEscrow.sol";
import {ERC20Config} from "../erc20/ERC20Config.sol";

/// @title TrustMutableAddressesTestFactory
contract TrustMutableAddressesTestFactory is Factory {
    using SafeERC20 for RedeemableERC20;

    address private immutable implementation;

    constructor(TrustConstructionConfig memory config_) {
        address implementation_ =
            address(new TrustMutableAddressesTest(config_));
        // This silences slither.
        require(implementation_ != address(0), "TRUST_0");
        emit Implementation(msg.sender, implementation_);
        implementation = implementation_;
    }

    function createChildTyped(
        TrustConfig calldata trustConfig_,
        TrustRedeemableERC20Config calldata trustRedeemableERC20Config_,
        TrustSeedERC20Config calldata trustSeedERC20Config_
    ) external returns (TrustMutableAddressesTest){
        return
            TrustMutableAddressesTest(
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
            TrustRedeemableERC20Config memory trustRedeemableERC20Config_
        ) = abi.decode(
                data_,
                (TrustConfig, TrustRedeemableERC20Config)
            );

        address clone_ = Clones.clone(implementation);

        TrustMutableAddressesTest(clone_).initialize(
            trustConfig_,
            trustRedeemableERC20Config_
        );

        return clone_;
    }
}
