// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

// Needed to handle structures externally
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol" as ERC20;
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import { SafeERC20 } from '@openzeppelin/contracts/token/ERC20/SafeERC20.sol';

import "hardhat/console.sol";

import { CRPFactory } from './configurable-rights-pool/contracts/CRPFactory.sol';
import { BFactory } from './configurable-rights-pool/contracts/test/BFactory.sol';

import { Constants } from './libraries/Constants.sol';
import { Initable } from './libraries/Initable.sol';
import { RedeemableERC20 } from './RedeemableERC20.sol';
import { RedeemableERC20Pool } from './RedeemableERC20Pool.sol';
import { IPrestige } from "./tv-prestige/contracts/IPrestige.sol";

import { BalancerContracts } from "./RedeemableERC20Pool.sol";
import { RedeemableERC20Config } from "./RedeemableERC20.sol";

struct TrustConfig {
    address seeder;
    // Amount of reserve token to initialize the pool.
    // The starting/final weights are calculated against this.
    // This amount will be refunded to the Trust owner regardless whether the min_raise is met.
    uint256 reserveInit;
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
contract Trust is Ownable, Initable {

    using SafeMath for uint256;
    using Math for uint256;

    TrustConfig public trustConfig;

    uint256 public initial_pool_valuation;
    uint256 public redeem_init;
    uint256 public min_raise;
    uint256 public seed_fee;

    using SafeERC20 for IERC20;
    RedeemableERC20 public token;
    RedeemableERC20Pool public pool;

    constructor (
        TrustConfig memory _trustConfig,
        RedeemableERC20Config memory _redeemableERC20Config,
        // Initial marketcap of the token according to the balancer pool denominated in reserve token.
        // Final market cap will be _redeem_init + _min_raise.
        uint256 _initial_pool_valuation,
        // The amount of reserve to back the redemption initially after trading finishes.
        // Anyone can send more of the reserve to the redemption token at any time to increase redemption value.
        uint256 _redeem_init,
        // Minimum amount to raise from the distribution period.
        // The raise is only considered successful if enough NEW funds enter the system to cover BOTH the _redeem_init + _min_raise.
        // If the raise is successful the _redeem_init is sent to token holders, otherwise the failed raise is refunded instead.
        uint256 _min_raise,
        // The amount that seeders receive in addition to what they contribute IFF the raise is successful.
        uint256 _seed_fee
    ) public {
        trustConfig = _trustConfig;

        initial_pool_valuation = _initial_pool_valuation;
        redeem_init = _redeem_init;
        min_raise = _min_raise;
        seed_fee = _seed_fee;

        token = new RedeemableERC20(
            _redeemableERC20Config
        );
    }

    // Fund the Trust.
    // This is where the trust takes ownership of assets to begin the distribution phase.
    function fund(BalancerContracts calldata balancerContracts) external onlyOwner withInit {
        IERC20 _reserve = token.reserve();
        _reserve.safeTransferFrom(
            trustConfig.seeder,
            address(this),
            trustConfig.reserveInit
        );

        pool = new RedeemableERC20Pool(
            balancerContracts,
            token,
            trustConfig.reserveInit,
            redeem_init,
            initial_pool_valuation,
            min_raise.add(redeem_init)
        );
        token.approve(address(pool), token.totalSupply());
        _reserve.approve(address(pool), pool.pool_amounts(0));

        pool.init();

        // Need to make a few addresses unfreezable to facilitate exits.
        token.addUnfreezable(address(pool.crp()));
        token.addUnfreezable(address(balancerContracts.balancerFactory));
        token.addUnfreezable(address(pool));
    }


    // This function can be called by anyone!
    // It defers to the pool exit function (which is owned by the trust and has block blocking).
    // If the minimum raise is reached then the trust owner receives the raise.
    // If the minimum raise is NOT reached then the reserve is refunded to the owner and sale proceeds rolled to token holders.
    function exit() external onlyInit {
        pool.exit();
        IERC20 _reserve = token.reserve();

        uint256 _final_balance = _reserve.balanceOf(address(this));
        uint256 _success_balance = trustConfig.reserveInit.add(seed_fee).add(redeem_init).add(min_raise);

        // Base payments for each fundraiser.
        uint256 _seedPay = 0;
        uint256 _creatorPay = 0;

        // Set aside the redemption and seed fee if we reached the minimum.
        if (_final_balance >= _success_balance) {
            // The seeder gets the reserve + seed fee
            _seedPay = trustConfig.reserveInit.add(seed_fee);

            // The creators get new funds raised minus redeem and seed fees.
            // Can subtract without underflow due to the inequality check for this code block.
            // Proof (assuming all positive integers):
            // final balance >= success balance
            // AND seed pay = reserve init + seed fee
            // AND success balance = reserve init + seed fee + redeem init + min raise
            // SO success balance = seed pay + redeem init + min raise
            // SO success balance >= seed pay + redeem init
            // SO success balance - (seed pay + redeem init) >= 0
            // SO final balance - (seed pay + redeem init) >= 0
            //
            // Implied is the remainder of _final_balance as redeem_init
            // This will be transferred to the token holders below.
            _creatorPay = _final_balance.sub(_seedPay.add(redeem_init));
        }
        else {
            // If we did not reach the minimum the creator gets nothing.
            // Refund what we can to other participants.
            // Due to pool dust it is possible the final balance is less than the reserve init.
            // If we don't take the min then we will attempt to transfer more than exists and brick the contract.
            //
            // Implied if _final_balance > reserve_init is the remainder goes to token holders below.
            _seedPay = trustConfig.reserveInit.min(_final_balance);
        }

        if (_creatorPay > 0) {
            _reserve.safeTransfer(
                owner(),
                _creatorPay
            );
        }

        _reserve.safeTransfer(
            trustConfig.seeder,
            _seedPay
        );

        // Send everything left to the token holders.
        // Implicitly the remainder of the _final_balance is:
        // - the redeem init if successful
        // - whatever users deposited in the AMM if unsuccessful
        uint256 _remainder = _reserve.balanceOf(address(this));
        if (_remainder > 0) {
            _reserve.safeTransfer(
                address(token),
                _remainder
            );
        }

        assert(_reserve.balanceOf(address(this)) == 0);
    }
}