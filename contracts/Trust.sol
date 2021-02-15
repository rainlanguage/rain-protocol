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

import { Initable } from './libraries/Initable.sol';
import { RedeemableERC20 } from './RedeemableERC20.sol';
import { RedeemableERC20Pool } from './RedeemableERC20Pool.sol';

contract Trust is Ownable, Initable {

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
        // @todo
        uint256 _token_reserve = _reserve_total;
        token = new RedeemableERC20(
            _name,
            _symbol,
            _reserve,
            _token_reserve,
            _mint_ratio
        );

        pool = new RedeemableERC20Pool(
            _crp_factory,
            _balancer_factory,
            token,
            _book_ratio
        );
    }

    function init(uint256 _unblock_block) public {
        token.init(_unblock_block);
        pool.init();
    }
}