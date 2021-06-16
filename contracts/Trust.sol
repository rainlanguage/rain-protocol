// contracts/GLDToken.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

// Needed to handle structures externally
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol" as ERC20;
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
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

enum RaiseStatus {
    Pending,
    Seeded,
    Trading,
    TradingCanEnd,
    Success,
    Fail
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
contract Trust {

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
        TrustConfig memory _trustConfig,
        RedeemableERC20Config memory _redeemableERC20Config,
        PoolConfig memory _poolConfig,
        // The amount of reserve to back the redemption initially after trading finishes.
        // Anyone can send more of the reserve to the redemption token at any time to increase redemption value.
        uint256 _redeemInit
    ) public {
        require(_redeemableERC20Config.totalSupply >= _poolConfig.reserveInit, "ERR_MIN_TOKEN_SUPPLY");
        require(_poolConfig.reserveInit > 0, "ERR_MIN_RESERVE");
        require(_poolConfig.initialValuation >= _poolConfig.finalValuation, "ERR_MIN_INITIAL_VALUTION");
        require(_poolConfig.finalValuation >= _redeemInit.add(_trustConfig.minCreatorRaise).add(_trustConfig.seederFee).add(_poolConfig.reserveInit), "ERR_MIN_FINAL_VALUATION");

        RedeemableERC20 _token = new RedeemableERC20(
            _redeemableERC20Config
        );
        RedeemableERC20Pool _pool = new RedeemableERC20Pool(
            _token,
            _poolConfig,
            _redeemInit
        );

        if (_trustConfig.seeder == address(0)) {
            require(_poolConfig.reserveInit.mod(_trustConfig.seederUnits) == 0, "ERR_SEED_PRICE_MULTIPLIER");
            uint256 _seedPrice = _poolConfig.reserveInit.div(_trustConfig.seederUnits);
            SeedERC20 _seedERC20 = new SeedERC20(SeedERC20Config(
                _poolConfig.reserve,
                _seedPrice,
                _trustConfig.seederUnits,
                _trustConfig.unseedDelay,
                "",
                ""
            ));
            _seedERC20.init(address(_pool));
            _trustConfig.seeder = address(_seedERC20);
        }

        // Need to make a few addresses unfreezable to facilitate exits.
        address _crp = address(_pool.crp());
        _token.ownerAddReceiver(_crp);
        _token.ownerAddSender(_crp);
        _token.ownerAddReceiver(address(_poolConfig.balancerFactory));
        _token.ownerAddReceiver(address(_pool));

        // The pool reserve must always be one of the redeemable assets.
        _token.ownerAddRedeemable(_poolConfig.reserve);

        // Send all tokens to the pool immediately.
        // When the seed funds are raised `startRaise` will build a pool from these.
        _token.safeTransfer(address(_pool), _redeemableERC20Config.totalSupply);

        trustConfig = _trustConfig;
        redeemInit = _redeemInit;
        token = _token;
        pool = _pool;
    }

    function getRaiseStatus() external view returns (RaiseStatus) {
        RaiseStatus _baseStatus = raiseStatus;
        if (_baseStatus == RaiseStatus.Pending && pool.reserve().balanceOf(address(this)) >= pool.reserveInit()) {
            return RaiseStatus.Seeded;
        }

        if (_baseStatus == RaiseStatus.Trading && pool.isUnblocked()) {
            return RaiseStatus.TradingCanEnd;
        }

        return _baseStatus;
    }

    function creatorAddRedeemable(IERC20 _redeemable) external {
        require(msg.sender == trustConfig.creator, "ERR_NOT_CREATOR");
        token.ownerAddRedeemable(_redeemable);
    }

    // This function can be called by anyone!
    // Fund the Trust.
    // This is where the trust takes ownership of assets to begin the distribution phase.
    // The only requirement is that the seeder can fund the pool.
    // Seeders should be careful NOT to approve the trust until/unless they are committed to funding it.
    // The pool is `init` after funding, which is onlyOwner, onlyInit, onlyBlocked.
    function startRaise() external {
        raiseStatus = RaiseStatus.Trading;
        uint256 _unblockBlock = block.number + trustConfig.raiseDuration;
        pool.ownerSetUnblockBlock(_unblockBlock);
        pool.init();
    }

    // This function can be called by anyone!
    // It defers to the pool exit function (which is owned by the trust and has onlyOwner, onlyInit, onlyUnblocked).
    // If the minimum raise is reached then the trust owner receives the raise.
    // If the minimum raise is NOT reached then the reserve is refunded to the owner and sale proceeds rolled to token holders.
    function endRaise() external {
        RedeemableERC20Pool _pool = pool;
        token.ownerSetUnblockBlock(block.number);
        _pool.exit();

        TrustConfig memory _trustConfig = trustConfig;
        RedeemableERC20 _token = token;
        IERC20 _reserve = pool.reserve();
        uint256 _seedInit = _pool.reserveInit();
        uint256 _tokenPay = redeemInit;

        uint256 _finalBalance = _reserve.balanceOf(address(this));
        uint256 _successBalance = _seedInit.add(_trustConfig.seederFee).add(_tokenPay).add(_trustConfig.minCreatorRaise);

        // Base payments for each fundraiser.
        uint256 _seederPay = 0;
        uint256 _creatorPay = 0;

        // Set aside the redemption and seed fee if we reached the minimum.
        if (_finalBalance >= _successBalance) {
            raiseStatus = RaiseStatus.Success;
            // The seeder gets the reserve + seed fee
            _seederPay = _seedInit.add(_trustConfig.seederFee);

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
            // Implied is the remainder of _finalBalance as redeemInit
            // This will be transferred to the token holders below.
            _creatorPay = _finalBalance.sub(_seederPay.add(_tokenPay));
        }
        else {
            raiseStatus = RaiseStatus.Fail;
            // If we did not reach the minimum the creator gets nothing.
            // Refund what we can to other participants.
            // Due to pool dust it is possible the final balance is less than the reserve init.
            // If we don't take the min then we will attempt to transfer more than exists and brick the contract.
            //
            // Implied if _finalBalance > reserve_init is the remainder goes to token holders below.
            _seederPay = _seedInit.min(_finalBalance);
        }

        if (_creatorPay > 0) {
            _reserve.safeTransfer(
                _trustConfig.creator,
                _creatorPay
            );
        }

        _reserve.safeTransfer(
            _trustConfig.seeder,
            _seederPay
        );

        // Send everything left to the token holders.
        // Implicitly the remainder of the _finalBalance is:
        // - the redeem init if successful
        // - whatever users deposited in the AMM if unsuccessful
        uint256 _remainder = _reserve.balanceOf(address(this));
        if (_remainder > 0) {
            _reserve.safeTransfer(
                address(_token),
                _remainder
            );
        }
    }
}