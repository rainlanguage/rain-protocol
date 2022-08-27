// SPDX-License-Identifier: CAL
// Inspired by OpenZeppelin (last updated v4.5.0) (utils/Checkpoints.sol)
pragma solidity ^0.8.0;

import {MathUpgradeable as Math} from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import {SafeCastUpgradeable as SafeCast} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

struct Timepoint {
    uint32 time;
    uint224 value;
}

struct History {
    Timepoint[] timepoints;
}

/// Open Zeppelin checkpoints but unopinionated re: block times vs. numbers.
/// Uses an intentionally ambiguous definition of "now" that is any uint32.
library Timepoints {
    /// Returns the value in the latest timepoint, or zero if there are no
    /// timepoints.
    function latest(History storage self_) internal view returns (uint256) {
        uint256 pos = self_.timepoints.length;
        return pos == 0 ? 0 : self_.timepoints[pos - 1].value;
    }

    /// Returns the value at a given block number. If a timepoint is not
    /// available at that time, the closest one before it is returned, or zero
    /// otherwise.
    function getAtTime(
        History storage self_,
        uint256 time_,
        uint256 now_
    ) internal view returns (uint256) {
        require(time_ < now_, "Timepoints: time not yet reached");

        uint256 high = self_.timepoints.length;
        uint256 low = 0;
        while (low < high) {
            uint256 mid = Math.average(low, high);
            if (self_.timepoints[mid].time > time_) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }
        return high == 0 ? 0 : self_.timepoints[high - 1].value;
    }

    /// Pushes a value onto a History so that it is stored as the timepoint for now.
    /// @return Previous value and new value.
    function push(
        History storage self_,
        uint256 value_,
        uint256 now_
    ) internal returns (uint256, uint256) {
        uint256 pos_ = self_.timepoints.length;
        uint256 old_ = latest(self_);
        if (pos_ > 0 && self_.timepoints[pos_ - 1].time == now_) {
            self_.timepoints[pos_ - 1].value = SafeCast.toUint224(value_);
        } else {
            self_.timepoints.push(
                Timepoint({
                    time: SafeCast.toUint32(now_),
                    value: SafeCast.toUint224(value_)
                })
            );
        }
        return (old_, value_);
    }

    /// Pushes a value onto a History, by updating the latest value using binary
    /// operation `op`. The new value will be set to `op(latest, delta)`.
    /// @return Returns previous value and new value.
    function push(
        History storage self_,
        function(uint256, uint256) view returns (uint256) op_,
        uint256 delta_,
        uint now_
    ) internal returns (uint256, uint256) {
        return push(self_, op_(latest(self_), delta_), now_);
    }
}
