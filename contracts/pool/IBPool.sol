// SPDX-License-Identifier: CAL
pragma solidity ^0.8.0;

/// Mirrors the Balancer `BPool` functions relevant to Rain.
/// Much of the Balancer contract is elided intentionally.
/// Clients should use Balancer code directly for full functionality.
// solhint-disable-next-line max-line-length
/// https://github.com/balancer-labs/balancer-core/blob/f4ed5d65362a8d6cec21662fb6eae233b0babc1f/contracts/BPool.sol
interface IBPool {
    // solhint-disable-next-line max-line-length
    // https://github.com/balancer-labs/balancer-core/blob/f4ed5d65362a8d6cec21662fb6eae233b0babc1f/contracts/BPool.sol#L423
    function swapExactAmountIn(
        address tokenIn,
        uint256 tokenAmountIn,
        address tokenOut,
        uint256 minAmountOut,
        uint256 maxPrice
    ) external returns (uint256 tokenAmountOut, uint256 spotPriceAfter);

    // solhint-disable-next-line max-line-length
    // https://github.com/balancer-labs/balancer-core/blob/f4ed5d65362a8d6cec21662fb6eae233b0babc1f/contracts/BPool.sol#L167
    function getBalance(address token) external view returns (uint256);

    // solhint-disable-next-line max-line-length
    // https://github.com/balancer-labs/balancer-core/blob/f4ed5d65362a8d6cec21662fb6eae233b0babc1f/contracts/BPool.sol#L334
    function gulp(address token) external;
}
