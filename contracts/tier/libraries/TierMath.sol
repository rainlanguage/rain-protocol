// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

library TierwiseCombine {
    // IF __every__ block number is lte `blockNumber_`
    // preserve the __oldest__ block number
    // on a per-tier basis.
    function andOld(
        uint256[] calldata reports_,
        uint256 blockNumber_
    ) internal pure returns (uint256) { }

    // IF __every__ block number is lte `blockNumber_`
    // preserve the __newest__ block number
    // on a per-tier basis.
    function andNew(
        uint256[] calldata reports_,
        uint256 blockNumber_
    ) internal pure returns (uint256) { }

    // IF __every__ block number is lte `blockNumber_`
    // preserve the __first__ block number in `reports_` order
    // on a per-tier basis.
    function andLeft(
        uint256[] calldata reports_,
        uint256 blockNumber_
    ) internal pure returns (uint256) { }

    // IF __any__ block number is lte `blockNumber_`
    // preserve the __oldest__ block number
    // on a per-tier basis.
    function orOld(
        uint256[] calldata reports_,
        uint256 blockNumber_
    ) internal pure returns (uint256) { }

    // IF __any__ block number is lte `blockNumber_`
    // preserve the __newest__ block number
    // on a per-tier basis.
    function orNew(
        uint256[] calldata reports_,
        uint256 blockNumber_
    ) internal pure returns (uint256) { }

    // IF __any__ block number is lte `blockNumber_`
    // preserve the __first__ block number in `reports_` order
    // on a per-tier basis.
    function orLeft(
        uint256[] calldata reports_,
        uint256 blockNumber_
    ) internal pure returns (uint256) { }
}