// SPDX-License-Identifier: CAL

pragma solidity ^0.8.10;

import "@openzeppelin/contracts/utils/math/Math.sol";

library TierwiseEmissions {
    using Math for uint256;

    function claimReport(
        uint256[] memory reports_,
        uint256 blockNumber_
    ) internal pure returns (uint256) {
        uint256 ret_;
        for (uint256 step_ = 0; step_ < 256; step_ += 32) {
            uint256[] memory vals_ = new uint256[](reports_.length);
            for (uint256 a_ = 0; a_ < vals_.length; a_++) {
                vals_[a_] = uint256(
                    uint256(reports_[a_] << 256 - step_ - 32)
                    >> 256 - 32
                );
            }
            // TODO:
            ret_ |= uint256(uint256(uint32(0)) << step_);
        }
        return ret_;
    }
}