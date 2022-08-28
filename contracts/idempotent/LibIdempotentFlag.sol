// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

type IdempotentFlag is uint256;

library LibIdempotentFlag {
    function get(IdempotentFlag flag_, uint256 index_)
        internal
        pure
        returns (bool)
    {
        return (IdempotentFlag.unwrap(flag_) >> index_) & 0x01 > 0;
    }

    function set(IdempotentFlag flag_, uint256 index_)
        internal
        pure
        returns (IdempotentFlag)
    {
        return
            IdempotentFlag.wrap(
                IdempotentFlag.unwrap(flag_) | (0x01 << index_)
            );
    }
}
