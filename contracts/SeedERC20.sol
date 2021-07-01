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

struct SeedERC20Config {
    IERC20 reserve;
    address recipient;
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

contract SeedERC20 is Ownable, ERC20, BlockBlockable {

    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    IERC20 public reserve;
    address public recipient;
    uint256 public seedPrice;
    uint256 public unseedDelay;

    mapping (address => uint256) public unseedLocks;

    constructor (
        SeedERC20Config memory seedERC20Config_
    ) public ERC20(seedERC20Config_.name, seedERC20Config_.symbol) {
        require(seedERC20Config_.seedPrice > 0, "ZERO_PRICE");
        require(seedERC20Config_.seedUnits > 0, "ZERO_UNITS");
        require(seedERC20Config_.recipient != address(0), "RECIPIENT_ZERO");
        seedPrice = seedERC20Config_.seedPrice;
        unseedDelay = seedERC20Config_.unseedDelay;
        reserve = seedERC20Config_.reserve;
        recipient = seedERC20Config_.recipient;
        _mint(address(this), seedERC20Config_.seedUnits);
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
    function seed(uint256 units_) external onlyBlocked {
        unseedLocks[msg.sender] = block.number + unseedDelay;
        // If balanceOf is less than units then the transfer below will fail and rollback anyway.
        if (balanceOf(address(this)) == units_) {
            setUnblockBlock(block.number);
        }
        _transfer(address(this), msg.sender, units_);

        // Reentrant reserve transfers.
        reserve.safeTransferFrom(msg.sender, address(this), seedPrice.mul(units_));
        // Immediately transfer to the recipient.
        // The transfer is immediate rather than only approving for the recipient.
        // This avoids the situation where a seeder immediately redeems their units before the recipient can withdraw.
        if (isUnblocked()) {
            reserve.safeTransfer(recipient, reserve.balanceOf(address(this)));
        }
    }

    // Send reserve back to seeder as units * seedPrice
    //
    // Allows addresses to back out of fund raising up until seeding is complete.
    //
    // Once the contract is seeded this function is disabled.
    // Once this function is disabled seeders are expected to call redeem at a later time.
    function unseed(uint256 units_) external onlyBlocked {
        // Prevent users from griefing contract with rapid seed/unseed cycles.
        require(unseedLocks[msg.sender] <= block.number, "UNSEED_LOCKED");

        _transfer(msg.sender, address(this), units_);

        // Reentrant reserve transfer.
        reserve.safeTransfer(msg.sender, seedPrice.mul(units_));
    }

    // Send reserve back to seeder as *pro-rata*
    // (units * reserve held by seed contract) / total seed token supply
    //
    // The recipient is expected to DO something with the funds that were raised for them.
    // Ideally the recipient will return funds equal to or greater than the funds raised back to this contract.
    // Once funds are returned back to this contract it makes sense for token holders to redeem their portion.
    //
    // For example, if `SeedERC20` is used as a seeder for a `Trust` contract (in this repo) it will receive a refund or refund + fee.
    function redeem(uint256 units_) external onlyUnblocked {
        uint256 _supplyBeforeBurn = totalSupply();
        _burn(msg.sender, units_);

        uint256 _currentReserveBalance = reserve.balanceOf(address(this));
        // Guard against someone accidentally calling redeem before any reserve has been returned.
        require(_currentReserveBalance > 0, "RESERVE_BALANCE");

        // Reentrant reserve transfer.
        reserve.safeTransfer(
            msg.sender,
            units_
                .mul(_currentReserveBalance)
                .div(_supplyBeforeBurn)
        );
    }
}