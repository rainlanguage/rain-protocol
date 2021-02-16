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

contract Trust is Ownable, Initable {

    CRPFactory crp_factory;
    BFactory balancer_factory;
    uint256 book_ratio;
    uint256 reserve_total;

    RedeemableERC20 public token;
    RedeemableERC20Pool public pool;

    constructor (
        CRPFactory _crp_factory,
        BFactory _balancer_factory,
        string memory _name,
        string memory _symbol,
        IERC20 _reserve,
        uint256 _reserve_total,
        uint256 _mint_ratio,
        uint256 _book_ratio
    ) public {
        crp_factory = _crp_factory;
        balancer_factory = _balancer_factory;
        book_ratio = _book_ratio;
        reserve_total = _reserve_total;

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

    function init(uint256 _unblock_block) public {
        token.reserve().transferFrom(this.owner(), address(this), reserve_total);
        console.log("Trust: init token: reserve balance: %s", token.reserve().balanceOf(address(this)));

        token.reserve().approve(address(token), token.reserve_total());
        token.init(_unblock_block);

        pool = new RedeemableERC20Pool(
            crp_factory,
            balancer_factory,
            token,
            book_ratio
        );
        console.log("Trust: init pool: reserve balance: %s", token.reserve().balanceOf(address(this)));
        token.approve(address(pool), token.totalSupply());
        // @todo dust is possible here, e.g. if the book ratio is 2 we divide by 3.
        // Either the init will fail and revert.
        // Or there will be a rounding error in the reserve trapped in the trust.
        token.reserve().approve(address(pool), pool.pool_amounts(0));
        pool.init();
    }
}