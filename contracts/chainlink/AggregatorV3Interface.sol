// Copied verbatim from Chainlink to avoid pulling in their entire repo that can
// include transitive deps with security issues.
// https://github.com/smartcontractkit/chainlink/blob/f8227975f4f4955f083c5b732354702a55bfdb8d/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function description() external view returns (string memory);

    function version() external view returns (uint256);

    function getRoundData(
        uint80 _roundId
    )
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}
