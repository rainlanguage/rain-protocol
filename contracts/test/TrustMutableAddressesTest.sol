// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import {SaturatingMath} from "../math/SaturatingMath.sol";

import {IBalancerConstants} from "../pool/IBalancerConstants.sol";
import {IBPool} from "../pool/IBPool.sol";
import {ICRPFactory} from "../pool/ICRPFactory.sol";
import {Rights} from "../pool/IRightsManager.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {RedeemableERC20, RedeemableERC20Config} from "../redeemableERC20/RedeemableERC20.sol";
import {SeedERC20, SeedERC20Config} from "../seed/SeedERC20.sol";
import {RedeemableERC20Factory} from "../redeemableERC20/RedeemableERC20Factory.sol";
import {SeedERC20Factory} from "../seed/SeedERC20Factory.sol";
import {BPoolFeeEscrow} from "../escrow/BPoolFeeEscrow.sol";
import {ERC20Config} from "../erc20/ERC20Config.sol";

import "../sale/ISale.sol";

import {PoolParams, IConfigurableRightsPool} from "../pool/IConfigurableRightsPool.sol";

struct CRPConfig {
    address reserve;
    address token;
    uint256 reserveInit;
    uint256 tokenSupply;
    uint256 initialValuation;
}

struct TrustConstructionConfig {
    address crpFactory;
    address balancerFactory;
    RedeemableERC20Factory redeemableERC20Factory;
    SeedERC20Factory seedERC20Factory;
}

struct TrustConfig {
    IERC20 reserve;
    uint256 reserveInit;
    uint256 initialValuation;
    uint256 finalValuation;
}

struct TrustSeedERC20Config {
    uint256 cooldownDuration;
    ERC20Config erc20Config;
}

struct TrustRedeemableERC20Config {
    ERC20Config erc20Config;
    address tier;
    uint256 minimumTier;
}

contract TrustMutableAddressesTest is ISale {
    using Math for uint256;
    using SaturatingMath for uint256;

    using SafeERC20 for IERC20;
    using SafeERC20 for RedeemableERC20;

    BPoolFeeEscrow private immutable bPoolFeeEscrow;

    SeedERC20Factory private immutable seedERC20Factory;
    RedeemableERC20Factory private immutable redeemableERC20Factory;
    address private immutable crpFactory;
    address private immutable balancerFactory;

    RedeemableERC20 private _token;
    IERC20 private _reserve;
    IConfigurableRightsPool public crp;

    uint256 private reserveInit;

    SaleStatus public saleStatus = SaleStatus.Pending;

    constructor(TrustConstructionConfig memory config_) {
        balancerFactory = config_.balancerFactory;
        crpFactory = config_.crpFactory;
        redeemableERC20Factory = config_.redeemableERC20Factory;
        seedERC20Factory = config_.seedERC20Factory;
        BPoolFeeEscrow bPoolFeeEscrow_ = new BPoolFeeEscrow();
        bPoolFeeEscrow = bPoolFeeEscrow_;
    }

    function initialize(
        TrustConfig memory config_,
        TrustRedeemableERC20Config memory trustRedeemableERC20Config_
    ) external {
        _reserve = config_.reserve;
        reserveInit = config_.reserveInit;

        address redeemableERC20_ = initializeRedeemableERC20(
            config_,
            trustRedeemableERC20Config_
        );
        _token = RedeemableERC20(redeemableERC20_);

        address crp_ = initializeCRP(
            CRPConfig(
                address(config_.reserve),
                redeemableERC20_,
                config_.reserveInit,
                trustRedeemableERC20Config_.erc20Config.initialSupply,
                config_.initialValuation
            )
        );
        crp = IConfigurableRightsPool(crp_);
    }

    function initializeRedeemableERC20(
        TrustConfig memory config_,
        TrustRedeemableERC20Config memory trustRedeemableERC20Config_
    ) private returns (address) {
        trustRedeemableERC20Config_.erc20Config.distributor = address(this);
        RedeemableERC20 redeemableERC20_ = RedeemableERC20(
            redeemableERC20Factory.createChild(
                abi.encode(
                    RedeemableERC20Config(
                        address(config_.reserve),
                        trustRedeemableERC20Config_.erc20Config,
                        trustRedeemableERC20Config_.tier,
                        trustRedeemableERC20Config_.minimumTier,
                        address(0)
                    )
                )
            )
        );
        redeemableERC20_.grantReceiver(address(bPoolFeeEscrow));
        return address(redeemableERC20_);
    }

    function initializeCRP(CRPConfig memory config_) private returns (address) {
        address[] memory poolAddresses_ = new address[](2);
        poolAddresses_[0] = address(config_.reserve);
        poolAddresses_[1] = address(config_.token);

        uint256[] memory poolAmounts_ = new uint256[](2);
        poolAmounts_[0] = config_.reserveInit;
        poolAmounts_[1] = config_.tokenSupply;

        uint256[] memory initialWeights_ = new uint256[](2);
        initialWeights_[0] = IBalancerConstants.MIN_WEIGHT;
        initialWeights_[1] = valuationWeight(
            config_.reserveInit,
            config_.initialValuation
        );

        address crp_ = ICRPFactory(crpFactory).newCrp(
            balancerFactory,
            PoolParams(
                "R20P",
                "RedeemableERC20Pool",
                poolAddresses_,
                poolAmounts_,
                initialWeights_,
                IBalancerConstants.MIN_FEE
            ),
            Rights(
                false,
                false,
                true,
                false,
                true,
                false
            )
        );

        RedeemableERC20(config_.token).grantReceiver(
            address(IConfigurableRightsPool(crp_).bFactory())
        );
        RedeemableERC20(config_.token).grantReceiver(address(this));
        RedeemableERC20(config_.token).grantSender(crp_);

        IERC20(config_.reserve).safeApprove(address(crp_), config_.reserveInit);
        IERC20(config_.token).safeApprove(address(crp_), config_.tokenSupply);

        return crp_;
    }

    function valuationWeight(uint256 reserveBalance_, uint256 valuation_)
        private
        pure
        returns (uint256)
    {
        uint256 weight_ = (valuation_ * IBalancerConstants.BONE) /
            reserveBalance_;
        return weight_;
    }

    function token() external view returns (address) {
        return address(_token);
    }

    function reserve() external view returns (address) {
        return address(_reserve);
    }

    function updateReserve(address reserve_) external {
      _reserve = IERC20(reserve_);
    }

    function updateToken(address token_) external {
      _token = RedeemableERC20(token_);
    }

    function updateCrp(address crp_) external {
      crp = IConfigurableRightsPool(crp_);
    }

    function updateStatus(SaleStatus saleStatus_) external {
      saleStatus = SaleStatus(saleStatus_);
    }
}
