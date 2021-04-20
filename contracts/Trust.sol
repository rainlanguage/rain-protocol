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

import "hardhat/console.sol";

import { CRPFactory } from './configurable-rights-pool/contracts/CRPFactory.sol';
import { BFactory } from './configurable-rights-pool/contracts/test/BFactory.sol';

import { Constants } from './libraries/Constants.sol';
import { Initable } from './libraries/Initable.sol';
import { RedeemableERC20 } from './RedeemableERC20.sol';
import { RedeemableERC20Pool } from './RedeemableERC20Pool.sol';

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

    CRPFactory crp_factory;
    BFactory balancer_factory;
    uint256 book_ratio;
    uint256 reserve_total;
    uint256 initial_pool_valuation;

    RedeemableERC20 public token;
    RedeemableERC20Pool public pool;

    constructor (
        CRPFactory _crp_factory,
        BFactory _balancer_factory,
        string memory _name,
        string memory _symbol,
        IERC20 _reserve,
        // e.g. $150 000 USDC to be shared across pool and redeem
        uint256 _reserve_total,
        // e.g. 2x to mint twice as many tokens as redeemable reserve tokens
        uint256 _mint_ratio,
        // e.g. 2x to put twice as many reserve tokens in redeem as the pool
        //      |  P: 50 000 |  T: 100 0000 |
        uint256 _book_ratio,
        // initial marketcap of the token according to the balancer pool denominated in reserve token
        // e.g. $1 000 000 USDC for a spot price of $5 with 200 000 tokens backed by $100 000 redeem and $50 000 pool
        uint256 _initial_pool_valuation
    ) public {
        crp_factory = _crp_factory;
        balancer_factory = _balancer_factory;
        book_ratio = _book_ratio;
        reserve_total = _reserve_total;
        initial_pool_valuation = _initial_pool_valuation;

        console.log("Trust: constructor: reserve_total: %s", _reserve_total);
        uint256 _token_reserve = SafeMath.div(
            SafeMath.mul(_reserve_total, _book_ratio),
            SafeMath.add(_book_ratio, Constants.ONE)
        );
        console.log("Trust: constructor: token_reserve: %s %s", _book_ratio, _token_reserve);
        token = new RedeemableERC20(
            _name,
            _symbol,
            _reserve,
            _token_reserve,
            _mint_ratio
        );
    }

    function init(uint256 _unblock_block) public onlyOwner withInit {
        token.reserve().transferFrom(owner(), address(this), reserve_total);
        console.log("Trust: init token: reserve balance: %s", token.reserve().balanceOf(address(this)));

        token.reserve().approve(address(token), token.reserve_init());
        token.init(_unblock_block);

        pool = new RedeemableERC20Pool(
            crp_factory,
            balancer_factory,
            token,
            book_ratio,
            initial_pool_valuation
        );
        console.log("Trust: init pool: reserve balance: %s", token.reserve().balanceOf(address(this)));
        token.approve(address(pool), token.totalSupply());
        // @todo dust is possible here, e.g. if the book ratio is 2 we divide by 3.
        // Either the init will fail and revert.
        // Or there will be a rounding error in the reserve trapped in the trust.
        // Recommend testing a dry run on local for desired parameters to avoid failed init on prod.
        token.reserve().approve(address(pool), pool.pool_amounts(0));
        pool.init();

        // Need to make a few addresses unfreezable to facilitate exits.
        token.addUnfreezable(address(pool.crp()));
        token.addUnfreezable(address(balancer_factory));
        token.addUnfreezable(address(pool));
    }

    function exit() public onlyOwner onlyInit {
        pool.exit();
        token.reserve().transfer(owner(), token.reserve().balanceOf(address(this)));
    }
}