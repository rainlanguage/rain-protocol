// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

abstract contract Sale {
    uint32 public immutable saleStartBlock;
    uint16 public lastUnitsSold;
    uint16 public totalUnitsSold;
    uint32 public lastBuyBlock;
    uint256 public lastBuyPrice;
    uint256 public totalReserveRaised;

    constructor(uint32 saleStartBlock_) {
        saleStartBlock = saleStartBlock_;
    }
}