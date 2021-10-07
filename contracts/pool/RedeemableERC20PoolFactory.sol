// SPDX-License-Identifier: CAL
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { Factory } from "../factory/Factory.sol";
import {
    RedeemableERC20Pool,
    RedeemableERC20PoolConfig
} from "./RedeemableERC20Pool.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { RedeemableERC20 } from "../redeemableERC20/RedeemableERC20.sol";

/// Everything required to construct a `RedeemableERC20PoolFactory`.
struct RedeemableERC20PoolFactoryConfig {
    // The `CRPFactory` on the current network.
    // This is an address published by Balancer or deployed locally during
    // testing.
    address crpFactory;
    // The `BFactory` on the current network.
    // This is an address published by Balancer or deployed locally during
    // testing.
    address balancerFactory;
}

/// Everything else required to construct new `RedeemableERC20Pool` child
/// contracts.
struct RedeemableERC20PoolFactoryRedeemableERC20PoolConfig {
    // The reserve erc20 token.
    // The reserve token anchors our newly minted redeemable tokens to an
    // existant value system.
    // The weights and balances of the reserve token and the minted token
    // define a dynamic spot price in the AMM.
    IERC20 reserve;
    // The newly minted redeemable token contract.
    // 100% of the total supply of the token MUST be transferred to the
    // `RedeemableERC20Pool` for it to function.
    // This implies a 1:1 relationship between redeemable pools and tokens.
    // IMPORTANT: It is up to the caller to define a reserve that will remain
    // functional and outlive the RedeemableERC20.
    // For example, USDC could freeze the tokens owned by the RedeemableERC20
    // contract or close their business.
    RedeemableERC20 token;
    // Amount of reserve token to initialize the pool.
    // The starting/final weights are calculated against this.
    uint256 reserveInit;
    // Initial marketcap of the token according to the balancer pool
    // denominated in reserve token.
    // Th spot price of the token is ( market cap / token supply ) where market
    // cap is defined in terms of the reserve.
    // The spot price of a balancer pool token is a function of both the
    // amounts of each token and their weights.
    // This bonding curve is described in the balancer whitepaper.
    // We define a valuation of newly minted tokens in terms of the deposited
    // reserve. The reserve weight is set to the minimum allowable value to
    // achieve maximum capital efficiency for the fund raising.
    uint256 initialValuation;
    // Final valuation is treated the same as initial valuation.
    // The final valuation will ONLY be achieved if NO TRADING OCCURS.
    // Any trading activity that net deposits reserve funds into the pool will
    // increase the spot price permanently.
    uint256 finalValuation;
    // Minimum duration IN BLOCKS of the trading on Balancer.
    // The trading does not stop until the `anonEndDistribution` function is
    // called.
    uint256 minimumTradingDuration;
}

/// @title RedeemableERC20PoolFactory
/// @notice Factory for creating and registering new `RedeemableERC20Pool`
/// contracts.
contract RedeemableERC20PoolFactory is Factory {
    /// ConfigurableRightsPool factory.
    address public immutable crpFactory;
    /// Balancer factory.
    address public immutable balancerFactory;

    /// @param config_ All configuration for the `RedeemableERC20PoolFactory`.
    constructor(RedeemableERC20PoolFactoryConfig memory config_) public {
        crpFactory = config_.crpFactory;
        balancerFactory = config_.balancerFactory;
    }

    /// @inheritdoc Factory
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
                config_.finalValuation,
                config_.minimumTradingDuration
            )
        );
        /// Transfer Balancer pool ownership to sender (e.g. `Trust`).
        pool_.transferOwnership(msg.sender);
        return address(pool_);
    }

    /// Allows calling `createChild` with
    /// `RedeemableERC20PoolFactoryRedeemableERC20PoolConfig` struct.
    /// Can use original Factory `createChild` function signature if function
    /// parameters are already encoded.
    ///
    /// @param config_ `RedeemableERC20Pool` constructor configuration.
    /// @return New `RedeemableERC20Pool` child contract address.
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