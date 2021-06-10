// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

pragma experimental ABIEncoderV2;

import { Initable } from "./libraries/Initable.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { BlockBlockable } from "./libraries/BlockBlockable.sol";

struct Config {
    IERC20 reserve;
    uint256 seedPrice;
    // Total seed units to be mint and sold.
    // 100% of all seed units must be sold for seeding to complete.
    // STRONGLY recommended to keep seed units to a small value (single-triple digits).
    // The ability for users to buy/sell or not buy/sell dust seed quantities is almost certainly NOT desired.
    uint256 seedUnits;
    uint256 unseedDelay;
    string name;
    string symbol;
}

contract SeedERC20 is Ownable, ERC20, Initable, BlockBlockable {

    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IERC20 public reserve;
    address public recipient;
    uint256 public seedPrice;
    uint256 public unseedDelay;

    mapping (address => uint256) public unseedLocks;

    constructor (
        Config memory _config
    ) public ERC20(_config.name, _config.symbol) {
        require(_config.seedPrice > 0, "0_PRICE");
        require(_config.seedUnits > 0, "0_UNITS");
        seedPrice = _config.seedPrice;
        unseedDelay = _config.unseedDelay;
        reserve = _config.reserve;
        _mint(address(this), _config.seedUnits);
    }

    // The init is to break a chicken/egg between the seeder and recipient.
    // The seeder needs to know the recipient so it can approve funds for the recipient.
    // The recipient needs to know the seeder so it can transfer funds from the seeder.
    //
    // The order of events is:
    // - seed contract is deployed
    // - recipient is deployed with seed contract address
    // - seed contract is init with recipient contract address
    //
    // The recipient can only be set by the owner during init.
    // The recipient cannot be changed as this would risk seeder funds.
    function init(address _recipient) external onlyOwner withInit {
        require(_recipient != address(0), "0_RECIPIENT");
        recipient = _recipient;
    }

    // Take reserve from seeder as units * seedPrice.
    //
    // Allows other addresses to partially fund the seedTotal in return for pro-rata seed tokens.
    //
    // When the final unit is sold the contract immediately:
    // - moves to seeded state
    // - approves infinite reserve transfers for the recipient
    //
    // Can only be called after init so that all callers are guaranteed to know the recipient.
    function seed(uint256 units) external onlyInit onlyBlocked {
        // If balanceOf is less than units then the transfer below will fail and rollback anyway.
        if (balanceOf(address(this)) == units) {
            setUnblockBlock(block.number);
            reserve.approve(recipient, uint256(-1));
        }
        unseedLocks[msg.sender] = block.number + unseedDelay;

        _transfer(address(this), msg.sender, units);
        reserve.transferFrom(msg.sender, address(this), seedPrice.mul(units));
    }

    // Send reserve back to seeder as units * seedPrice
    //
    // Allows addresses to back out of fund raising up until seeding is complete.
    //
    // Once the contract is seeded this function is disabled.
    // Once this function is disabled seeders are expected to call redeem at a later time.
    function unseed(uint256 units) external onlyInit onlyBlocked {
        // Prevent users from griefing contract with rapid seed/unseed cycles.
        require(unseedLocks[msg.sender] <= block.number, "UNSEED_LOCKED");

        _transfer(msg.sender, address(this), units);
        reserve.safeTransfer(msg.sender, seedPrice.mul(units));
    }

    // Send reserve back to seeder as *pro-rata*
    // (units * reserve held by seed contract) / total seed token supply
    //
    // The recipient is expected to DO something with the funds that were raised for them.
    // Ideally the recipient will return funds equal to or greater than the funds raised back to this contract.
    // Once funds are returned back to this contract it makes sense for token holders to redeem their portion.
    //
    // For example, if `SeedERC20` is used as a seeder for a `Trust` contract (in this repo) it will receive a refund or refund + fee.
    function redeem(uint256 units) external onlyInit onlyUnblocked {
        uint256 _currentReserveBalance = reserve.balanceOf(address(this));
        // Guard against someone accidentally calling redeem before any reserve has been returned.
        require(_currentReserveBalance > 0, "RESERVE_BALANCE");

        reserve.safeTransfer(
            msg.sender,
            units
                .mul(_currentReserveBalance)
                .div(totalSupply())
        );
        _burn(msg.sender, units);
    }

}