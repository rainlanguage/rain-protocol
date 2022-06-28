// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

library CoerceBytes {
    function toUint256Array(bytes memory bytes_)
        internal
        pure
        returns (uint256[] memory array_)
    {
        require(bytes_.length % 0x20 == 0, "BAD_LENGTH");
        assembly {
            array_ := bytes_
            mstore(array_, div(mload(array_), 0x20))
        }
    }

    function fromUint256Array(uint256[] memory array_)
        internal
        pure
        returns (bytes memory bytes_)
    {
        assembly {
            bytes_ := array_
            mstore(bytes_, mul(mload(bytes_), 0x20))
        }
    }
}
