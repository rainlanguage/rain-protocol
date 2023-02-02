// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

error UnexpectedMetaHash(bytes32 expectedHash, bytes32 actualHash);

library LibCallerMeta {
    function checkCallerMeta(
        bytes32 expectedHash_,
        bytes memory callerMeta_
    ) internal pure {
        bytes32 actualHash_ = keccak256(callerMeta_);
        if (expectedHash_ != actualHash_) {
            revert UnexpectedMetaHash(expectedHash_, actualHash_);
        }
    }
}
