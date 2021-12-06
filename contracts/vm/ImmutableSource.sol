// SPDX-License-Identifier: CAL
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/utils/math/Math.sol";
import { Source } from "./RainVM.sol";

abstract contract ImmutableSource {
    uint256 public immutable val0;
    uint256 public immutable val1;
    uint256 public immutable val2;
    uint256 public immutable val3;
    uint256 public immutable val4;
    uint256 public immutable val5;
    uint256 public immutable val6;
    uint256 public immutable val7;
    uint256 public immutable val8;
    uint256 public immutable val9;
    uint256 public immutable val10;
    uint256 public immutable val11;
    uint256 public immutable val12;
    uint256 public immutable val13;
    uint256 public immutable val14;
    uint256 public immutable val15;

    uint256 public immutable source0;
    uint256 public immutable source1;
    uint256 public immutable source2;
    uint256 public immutable source3;

    uint8 public immutable valsLength;
    uint8 public immutable sourceLength;

    constructor(
        Source memory source_
    ) {
        require(source_.thisVals.length <= 16, "IMMUTABLE_VALS_LIMIT");
        require(source_.source.length <= 4, "IMMUTABLE_SOURCE_LIMIT");

        val0 = 0 < source_.thisVals.length ? source_.thisVals[0] : 0;
        val1 = 1 < source_.thisVals.length ? source_.thisVals[1] : 0;
        val2 = 2 < source_.thisVals.length ? source_.thisVals[2] : 0;
        val3 = 3 < source_.thisVals.length ? source_.thisVals[3] : 0;
        val4 = 4 < source_.thisVals.length ? source_.thisVals[4] : 0;
        val5 = 5 < source_.thisVals.length ? source_.thisVals[5] : 0;
        val6 = 6 < source_.thisVals.length ? source_.thisVals[6] : 0;
        val7 = 7 < source_.thisVals.length ? source_.thisVals[7] : 0;
        val8 = 8 < source_.thisVals.length ? source_.thisVals[8] : 0;
        val9 = 9 < source_.thisVals.length ? source_.thisVals[9] : 0;
        val10 = 10 < source_.thisVals.length ? source_.thisVals[10] : 0;
        val11 = 11 < source_.thisVals.length ? source_.thisVals[11] : 0;
        val12 = 12 < source_.thisVals.length ? source_.thisVals[12] : 0;
        val13 = 13 < source_.thisVals.length ? source_.thisVals[13] : 0;
        val14 = 14 < source_.thisVals.length ? source_.thisVals[14] : 0;
        val15 = 15 < source_.thisVals.length ? source_.thisVals[15] : 0;

        source0 = 0 < source_.source.length ? source_.source[0] : 0;
        source1 = 1 < source_.source.length ? source_.source[1] : 0;
        source2 = 2 < source_.source.length ? source_.source[2] : 0;
        source3 = 3 < source_.source.length ? source_.source[3] : 0;

        valsLength = uint8(source_.thisVals.length);
        sourceLength = uint8(source_.source.length);
    }

    function source() internal view returns(Source memory) {
        uint256[] memory source_ = new uint256[](sourceLength);

        source_[0] = 0 < sourceLength ? source0 : 0;
        source_[1] = 1 < sourceLength ? source1 : 0;
        source_[2] = 2 < sourceLength ? source2 : 0;
        source_[3] = 3 < sourceLength ? source3 : 0;

        uint256[] memory vals_ = new uint256[](valsLength);

        vals_[0] = 0 < valsLength ? val0 : 0;
        vals_[1] = 1 < valsLength ? val1 : 0;
        vals_[2] = 2 < valsLength ? val2 : 0;
        vals_[3] = 3 < valsLength ? val3 : 0;
        vals_[4] = 4 < valsLength ? val4 : 0;
        vals_[5] = 5 < valsLength ? val5 : 0;
        vals_[6] = 6 < valsLength ? val6 : 0;
        vals_[7] = 7 < valsLength ? val7 : 0;
        vals_[8] = 8 < valsLength ? val8 : 0;
        vals_[9] = 9 < valsLength ? val9 : 0;
        vals_[10] = 10 < valsLength ? val10 : 0;
        vals_[11] = 11 < valsLength ? val11 : 0;
        vals_[12] = 12 < valsLength ? val12 : 0;
        vals_[13] = 13 < valsLength ? val13 : 0;
        vals_[14] = 14 < valsLength ? val14 : 0;
        vals_[15] = 15 < valsLength ? val15 : 0;
        uint256[] memory forwardedVals_ = new uint256[](0);
        return Source(source_, vals_, forwardedVals_);
    }
}
