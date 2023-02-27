// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "./IMetaV1.sol";

error UnexpectedMetaHash(bytes32 expectedHash, bytes32 actualHash);

/// Thrown when some bytes are expected to be rain meta and are not.
/// @param unmeta the bytes that are not meta.
error NotRainMetaV1(bytes unmeta);

/// @title LibMeta
/// @notice Need a place to put data that can be handled offchain like ABIs that
/// IS NOT etherscan.
library LibMeta {
    function isRainMetaV1(bytes memory meta_) internal pure returns (bool) {
        uint256 mask_ = type(uint64).max;
        uint256 magicNumber_ = META_MAGIC_NUMBER_V1;
        assembly ("memory-safe") {
            magicNumber_ := and(mload(add(meta_, 8)), mask_)
        }
        return magicNumber_ == META_MAGIC_NUMBER_V1;
    }

    function checkMeta(
        bytes32 expectedHash_,
        bytes memory meta_
    ) internal pure {
        bytes32 actualHash_ = keccak256(meta_);
        if (expectedHash_ != actualHash_) {
            revert UnexpectedMetaHash(expectedHash_, actualHash_);
        }
        if (!isRainMetaV1(meta_)) {
            revert NotRainMetaV1(meta_);
        }
    }
}
