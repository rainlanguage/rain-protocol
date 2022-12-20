// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../../array/LibUint256Array.sol";

import {SignatureCheckerUpgradeable as SignatureChecker} from "@openzeppelin/contracts-upgradeable/utils/cryptography/SignatureCheckerUpgradeable.sol";
import {ECDSAUpgradeable as ECDSA} from "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";

struct SignedContext {
    address signer;
    bytes signature;
    uint256[] context;
}

library LibContext {
    using LibUint256Array for uint256[];

    function base() internal view returns (uint256[] memory) {
        return
            LibUint256Array.arrayFrom(
                uint(uint160(msg.sender)),
                uint(uint160(address(this)))
            );
    }

    function hash(uint256[] memory context_) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(context_));
    }

    function ensureSignedContextSignatureIsValid(
        SignedContext memory signedContext_
    ) internal view {
        require(
            SignatureChecker.isValidSignatureNow(
                signedContext_.signer,
                ECDSA.toEthSignedMessageHash(
                    keccak256(abi.encodePacked(signedContext_.context))
                ),
                signedContext_.signature
            ),
            "INVALID_SIGNATURE"
        );
    }

    function build(
        uint256[][] memory baseContext_,
        uint256[] memory callingContext_,
        SignedContext[] memory signedContexts_
    ) internal view returns (uint256[][] memory) {
        unchecked {
            uint256[] memory signers_ = new uint256[](signedContexts_.length);
            uint256[][] memory context_ = new uint256[][](
                baseContext_.length + signedContexts_.length + 2
            );
            context_[0] = LibContext.base();
            uint256 offset_ = 1;
            for (uint256 i_ = 0; i_ < baseContext_.length; i_++) {
                context_[i_ + offset_] = baseContext_[i_];
            }
            offset_ = baseContext_.length;
            context_[offset_] = callingContext_;
            context_[offset_ + 1] = signers_;
            offset_ = offset_ + 2;
            for (uint256 i_ = 0; i_ < signedContexts_.length; i_++) {
                ensureSignedContextSignatureIsValid(signedContexts_[i_]);

                signers_[i_] = uint256(uint160(signedContexts_[i_].signer));
                context_[i_ + offset_] = signedContexts_[i_].context;
            }
            return context_;
        }
    }
}
