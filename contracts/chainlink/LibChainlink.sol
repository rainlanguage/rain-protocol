// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "../math/FixedPointMath.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";

library LibChainlink {
    using SafeCast for int256;
    using FixedPointMath for uint256;

    function price(address feed_, uint256 staleAfter_)
        internal
        view
        returns (uint256 price_)
    {
        (, int256 answer_, , uint256 updatedAt_, ) = AggregatorV3Interface(
            feed_
        ).latestRoundData();
        require(answer_ > 0, "MIN_BASE_PRICE");
        // Checked time comparison ensures no updates from the future as that
        // would overflow, and no stale prices.
        // solhint-disable-next-line not-rely-on-time
        require(block.timestamp - updatedAt_ < staleAfter_, "STALE_PRICE");

        // Safely cast the answer to uint and scale it to 18 decimal FP.
        price_ = answer_.toUint256().scale18(
            AggregatorV3Interface(feed_).decimals()
        );
    }
}
