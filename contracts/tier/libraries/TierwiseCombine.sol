// SPDX-License-Identifier: CAL

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/Math.sol";

library TierwiseCombine {
    using Math for uint256;

    // IF __every__ block number is lte `blockNumber_`
    // preserve the __oldest__ block number
    // on a per-tier basis.
    function andOld(
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
            uint256 accumulator_ = uint256(-1);
            for (uint256 i_ = 0; i_ < vals_.length; i_++) {
                accumulator_ = vals_[i_] <= blockNumber_
                    ? vals_[i_].min(accumulator_) : uint256(-1);
            }
            ret_ |= uint256(uint256(uint32(accumulator_)) << step_);
        }
        return ret_;
    }

    // IF __every__ block number is lte `blockNumber_`
    // preserve the __newest__ block number
    // on a per-tier basis.
    function andNew(
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
            uint256 accumulator_ = uint256(-1);
            for (uint256 i_ = 0; i_ < vals_.length; i_++) {
                accumulator_ = vals_[i_] <= blockNumber_
                    ? vals_[i_].max(accumulator_) : uint256(-1);
            }
            ret_ |= uint256(uint256(uint32(accumulator_)) << step_);
        }
        return ret_;
    }

    // IF __every__ block number is lte `blockNumber_`
    // preserve the __first__ block number in `reports_` order
    // on a per-tier basis.
    function andLeft(
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
            uint256 accumulator_ = uint256(-1);
            for (uint256 i_ = 0; i_ < vals_.length; i_++) {
                accumulator_ = vals_[i_] <= blockNumber_
                    ? accumulator_ : uint256(-1);
            }
            ret_ |= uint256(uint256(uint32(accumulator_)) << step_);
        }
        return ret_;
    }

    // IF __any__ block number is lte `blockNumber_`
    // preserve the __oldest__ block number
    // on a per-tier basis.
    function orOld(
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
            uint256 accumulator_ = uint256(-1);
            for (uint256 i_ = 0; i_ < vals_.length; i_++) {
                accumulator_ = vals_[i_] <= blockNumber_
                    ? vals_[i_].min(accumulator_) : accumulator_;
            }
            ret_ |= uint256(uint256(uint32(accumulator_)) << step_);
        }
        return ret_;

    }

    // IF __any__ block number is lte `blockNumber_`
    // preserve the __newest__ block number
    // on a per-tier basis.
    function orNew(
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
            uint256 accumulator_ = uint256(-1);
            for (uint256 i_ = 0; i_ < vals_.length; i_++) {
                accumulator_ = vals_[i_] <= blockNumber_
                    ? vals_[i_].max(accumulator_) : accumulator_;
            }
            ret_ |= uint256(uint256(uint32(accumulator_)) << step_);
        }
        return ret_;
    }

    // IF __any__ block number is lte `blockNumber_`
    // preserve the __first__ block number in `reports_` order
    // on a per-tier basis.
    function orLeft(
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
            uint256 accumulator_ = uint256(-1);
            for (uint256 i_ = 0; i_ < vals_.length; i_++) {
                accumulator_ = vals_[i_] <= blockNumber_
                    ? accumulator_ : accumulator_;
            }
            ret_ |= uint256(uint256(uint32(accumulator_)) << step_);
        }
        return ret_;
    }
}