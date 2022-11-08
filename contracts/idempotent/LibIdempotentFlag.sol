// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

type IdempotentFlag is uint256;

library LibIdempotentFlag {
    using LibIdempotentFlag for IdempotentFlag;

    function get(
        IdempotentFlag flag_,
        uint256 index_
    ) internal pure returns (bool) {
        return (IdempotentFlag.unwrap(flag_) >> index_) & 0x01 > 0;
    }

    function set(
        IdempotentFlag flag_,
        uint256 index_
    ) internal pure returns (IdempotentFlag) {
        return
            IdempotentFlag.wrap(
                IdempotentFlag.unwrap(flag_) | (0x01 << index_)
            );
    }

    modifier only16x16(uint256 column_, uint256 row_) {
        require(column_ < 16, "OOB_COLUMN");
        require(row_ < 16, "OOB_ROW");
        _;
    }

    function get16x16(
        IdempotentFlag flag_,
        uint256 column_,
        uint256 row_
    ) internal pure only16x16(column_, row_) returns (bool) {
        unchecked {
            return flag_.get(column_ * 16 + row_);
        }
    }

    function set16x16(
        IdempotentFlag flag_,
        uint256 column_,
        uint256 row_
    ) internal pure only16x16(column_, row_) returns (IdempotentFlag) {
        unchecked {
            return flag_.set(column_ * 16 + row_);
        }
    }
}
