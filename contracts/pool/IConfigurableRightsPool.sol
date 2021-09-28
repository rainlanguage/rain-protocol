// SPDX-License-Identifier: CAL
pragma solidity 0.6.12;

pragma experimental ABIEncoderV2;

struct PoolParams {
    string poolTokenSymbol;
    string poolTokenName;
    address[] constituentTokens;
    uint[] tokenBalances;
    uint[] tokenWeights;
    uint swapFee;
}

interface IConfigurableRightsPool {
    function bPool() external view returns (address);
    function bFactory() external view returns (address);

    function createPool(
        uint initialSupply,
        uint minimumWeightChangeBlockPeriodParam,
        uint addTokenTimeLockInBlocksParam
    ) external;

    function updateWeightsGradually(
        uint[] calldata newWeights,
        uint startBlock,
        uint endBlock
    ) external;

    function exitPool(uint poolAmountIn, uint[] calldata minAmountsOut)
        external;
}