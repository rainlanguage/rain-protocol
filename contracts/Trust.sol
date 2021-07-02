// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

// Needed to handle structures externally
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol" as ERC20;
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

import { CRPFactory } from "./configurable-rights-pool/contracts/CRPFactory.sol";
import { BFactory } from "./configurable-rights-pool/contracts/test/BFactory.sol";

import { Constants } from "./libraries/Constants.sol";
import { Initable } from "./libraries/Initable.sol";
import { RedeemableERC20 } from "./RedeemableERC20.sol";
import { RedeemableERC20Pool } from "./RedeemableERC20Pool.sol";
import { IPrestige } from "./tv-prestige/contracts/IPrestige.sol";

import { PoolConfig } from "./RedeemableERC20Pool.sol";
import { RedeemableERC20Config } from "./RedeemableERC20.sol";
import { SeedERC20, SeedERC20Config } from "./SeedERC20.sol";

struct TrustContracts {
    address reserveERC20;
    address redeemableERC20;
    address redeemableERC20Pool;
    address seeder;
    address prestige;
    address crp;
    address pool;
}

enum RaiseStatus {
    Pending,
    Seeded,
    Trading,
    TradingCanEnd,
    Success,
    Fail
}

struct RaiseProgress {
    RaiseStatus raiseStatus;
    uint256 poolReserveBalance;
    uint256 poolTokenBalance;
    uint256 reserveInit;
    uint256 minCreatorRaise;
    uint256 seederFee;
    uint256 redeemInit;
}

struct TrustConfig {
    address creator;
    // Minimum amount to raise for the creator from the distribution period.
    // The raise is only considered successful if enough NEW funds enter the system to cover BOTH the _redeemInit + _minRaise.
    // If the raise is successful the _redeemInit is sent to token holders, otherwise the failed raise is refunded instead.
    uint256 minCreatorRaise;
    address seeder;
    // The amount that seeders receive in addition to what they contribute IFF the raise is successful.
    uint256 seederFee;
    uint256 seederUnits;
    uint256 unseedDelay;
    uint256 raiseDuration;
}

// Examples
// 2 book ratio: 20:1 95%
// | P: 50 000 | T: 100 000 |
// | V: 1 000 000 | T: 100 000 |
//
// Pool:
// - works in terms of weights and derives values based on amounts relative to the weights
// - if we have T tokens in circulation and we put P$ in the pool and say it is 1:20 ratio
//   this => T tokens = 20x P$ from the pool's perspective
//   => $50 000 in the pool at 20x weighting => $ 1 000 000 valuation for the tokens
//
// Redemption:
// - pure book value
// - a specific block in the future at which point T tokens = R$ pro rata
// - completely linear and fixed
// - if we put R$ in at the start which is $ 100 000 this values all tokens T at $ 100 000
//
// So if the ratio of ( $P x weight ) of $P to $R is > 1 then we're adding speculative value
//
// So when we _create_ the trust _we_ put in ( $P + $R ) and we define weights + book ratio
//
// example 2:
//
// $ 150 000 total ( $P + $R )
//
// T = 100 000
//
// expected max valuation = $3 per token = $300 000
// book value ( $R ) = $ 100 000
// pool $P = $ 50 000
// 100 000 T : $P => $300 000
// 50 000 : 300 000 = weight of $P
// therefore the weight should be 6 for $P at the start
// T which is the mint ratio = 1 because we minted 100 000 T for 100 000 $R
//
// Start:
// Pool: 100 000 T : $ 50 000 - weight of 6:1 T - which is spot price $3 per T
// Book: 0 T: $100 000 - therefore 1 T = $1 after unlock
//
// End at a preset block:
// Pool: 20 000 T : $ 200 000 - weight 1:10 T - PT in the trust
// Exit => PT is all given to the initializer/owner of the trust
// $200 000 + 20 000 T which can be immediately redeemed for $1 each => after redemption lump sum $220 000
//
// | TV hype to create premium  | TV cashes out premium and delivers goodies |
// | Phase trading distribution | Phase goodies + stablecoin proxy           |
contract Trust is ReentrancyGuard {

    using SafeMath for uint256;
    using Math for uint256;

    TrustConfig public trustConfig;

    RaiseStatus private raiseStatus;
    uint256 public redeemInit;

    using SafeERC20 for IERC20;
    using SafeERC20 for RedeemableERC20;
    RedeemableERC20 public token;
    RedeemableERC20Pool public pool;

    constructor (
        TrustConfig memory trustConfig_,
        RedeemableERC20Config memory redeemableERC20Config_,
        PoolConfig memory poolConfig_,
        // The amount of reserve to back the redemption initially after trading finishes.
        // Anyone can send more of the reserve to the redemption token at any time to increase redemption value.
        uint256 redeemInit_
    ) public {
        require(redeemableERC20Config_.totalSupply >= poolConfig_.reserveInit, "MIN_TOKEN_SUPPLY");
        require(poolConfig_.reserveInit > 0, "MIN_RESERVE");
        require(poolConfig_.initialValuation >= poolConfig_.finalValuation, "MIN_INITIAL_VALUTION");

        trustConfig = trustConfig_;
        redeemInit = redeemInit_;
        token =  new RedeemableERC20(
            redeemableERC20Config_
        );
        pool = new RedeemableERC20Pool(
            token,
            poolConfig_
        );

        if (trustConfig.seeder == address(0)) {
            require(poolConfig_.reserveInit.mod(trustConfig.seederUnits) == 0, "SEED_PRICE_MULTIPLIER");
            trustConfig.seeder = address(new SeedERC20(SeedERC20Config(
                poolConfig_.reserve,
                address(pool),
                // seed price.
                poolConfig_.reserveInit.div(trustConfig.seederUnits),
                trustConfig.seederUnits,
                trustConfig.unseedDelay,
                "",
                ""
            )));
        }

        // Need to make a few addresses unfreezable to facilitate exits.
        token.ownerAddReceiver(address(pool.crp()));
        token.ownerAddSender(address(pool.crp()));
        token.ownerAddReceiver(address(poolConfig_.balancerFactory));
        token.ownerAddReceiver(address(pool));

        // The pool reserve must always be one of the redeemable assets.
        token.ownerAddRedeemable(poolConfig_.reserve);

        // Send all tokens to the pool immediately.
        // When the seed funds are raised `startRaise` will build a pool from these.
        token.safeTransfer(address(pool), redeemableERC20Config_.totalSupply);

        require(poolConfig_.finalValuation >= successBalance(), "MIN_FINAL_VALUATION");
    }

    function successBalance() public view returns(uint256) {
        return pool.reserveInit().add(trustConfig.seederFee).add(redeemInit).add(trustConfig.minCreatorRaise);
    }

    function getContracts() external view returns(TrustContracts memory) {
        return TrustContracts(
            address(pool.reserve()),
            address(token),
            address(pool),
            address(trustConfig.seeder),
            address(token.prestige()),
            address(pool.crp()),
            address(pool.crp().bPool())
        );
    }

    function getRaiseProgress() external view returns(RaiseProgress memory) {
        address balancerPool_ = address(pool.crp().bPool());
        uint256 poolReserveBalance_;
        uint256 poolTokenBalance_;
        if (balancerPool_ != address(0)) {
            poolReserveBalance_ = pool.reserve().balanceOf(balancerPool_);
            poolTokenBalance_ = token.balanceOf(balancerPool_);
        }
        else {
            poolReserveBalance_ = 0;
            poolTokenBalance_ = 0;
        }

        return RaiseProgress(
            getRaiseStatus(),
            poolReserveBalance_,
            poolTokenBalance_,
            pool.reserveInit(),
            trustConfig.minCreatorRaise,
            trustConfig.seederFee,
            redeemInit
        );
    }

    function getRaiseStatus() public view returns (RaiseStatus) {
        RaiseStatus baseStatus_ = raiseStatus;
        if (baseStatus_ == RaiseStatus.Pending && pool.reserve().balanceOf(address(pool)) >= pool.reserveInit()) {
            return RaiseStatus.Seeded;
        }

        if (baseStatus_ == RaiseStatus.Trading && pool.isUnblocked()) {
            return RaiseStatus.TradingCanEnd;
        }

        return baseStatus_;
    }

    function creatorAddRedeemable(IERC20 redeemable_) external {
        require(msg.sender == trustConfig.creator, "NOT_CREATOR");
        token.ownerAddRedeemable(redeemable_);
    }

    // This function can be called by anyone!
    // Fund the Trust.
    // This is where the trust takes ownership of assets to begin the distribution phase.
    // The only requirement is that the seeder can fund the pool.
    // Seeders should be careful NOT to approve the trust until/unless they are committed to funding it.
    // The pool is `init` after funding, which is onlyOwner, onlyInit, onlyBlocked.
    function startRaise() external {
        raiseStatus = RaiseStatus.Trading;
        pool.init(block.number + trustConfig.raiseDuration);
    }

    // This function can be called by anyone!
    // It defers to the pool exit function (which is owned by the trust and has onlyOwner, onlyInit, onlyUnblocked).
    // If the minimum raise is reached then the trust owner receives the raise.
    // If the minimum raise is NOT reached then the reserve is refunded to the owner and sale proceeds rolled to token holders.
    function endRaise() external nonReentrant {
        uint256 finalBalance_ = pool.reserve().balanceOf(address(pool.crp().bPool()));
        if (finalBalance_ >= successBalance()) {
            raiseStatus = RaiseStatus.Success;
        }
        else {
            raiseStatus = RaiseStatus.Fail;
        }

        token.ownerSetUnblockBlock(block.number);
        pool.exit();

        // Balancer traps a tiny amount of reserve in the pool when it exits.
        uint256 poolDust_ = pool.reserve().balanceOf(address(pool.crp().bPool()));
        // The dust is included in the final balance for UX reasons.
        // We don't want to fail the raise due to dust, even if technically it was a failure.
        // To ensure a good UX for creators and token holders we subtract the dust from the seeder.
        uint256 availableBalance_ = pool.reserve().balanceOf(address(this));

        // Base payments for each fundraiser.
        uint256 seederPay_ = pool.reserveInit().sub(poolDust_);
        uint256 creatorPay_ = 0;

        // Set aside the redemption and seed fee if we reached the minimum.
        if (raiseStatus == RaiseStatus.Success) {
            // The seeder gets an additional fee on success.
            seederPay_ = seederPay_.add(trustConfig.seederFee);

            // The creators get new funds raised minus redeem and seed fees.
            // Can subtract without underflow due to the inequality check for this code block.
            // Proof (assuming all positive integers):
            // final balance >= success balance
            // AND seed pay = seed init + seed fee
            // AND success balance = seed init + seed fee + token pay + min raise
            // SO success balance = seed pay + token pay + min raise
            // SO success balance >= seed pay + token pay
            // SO success balance - (seed pay + token pay) >= 0
            // SO final balance - (seed pay + token pay) >= 0
            //
            // Implied is the remainder of finalBalance_ as redeemInit
            // This will be transferred to the token holders below.
            creatorPay_ = availableBalance_.sub(seederPay_.add(redeemInit));
        }

        if (creatorPay_ > 0) {
            pool.reserve().safeTransfer(
                trustConfig.creator,
                creatorPay_
            );
        }

        pool.reserve().safeTransfer(
            trustConfig.seeder,
            seederPay_
        );

        // Send everything left to the token holders.
        // Implicitly the remainder of the finalBalance_ is:
        // - the redeem init if successful
        // - whatever users deposited in the AMM if unsuccessful
        uint256 remainder_ = pool.reserve().balanceOf(address(this));
        if (remainder_ > 0) {
            pool.reserve().safeTransfer(
                address(token),
                remainder_
            );
        }
    }
}