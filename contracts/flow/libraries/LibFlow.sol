// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../interpreter/run/LibStackPointer.sol";
import "../../interpreter/store/IInterpreterStoreV1.sol";
import "../../sentinel/LibSentinel.sol";

import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IERC721Upgradeable as IERC721} from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import {IERC1155Upgradeable as IERC1155} from "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import {AddressUpgradeable as Address} from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import {SafeCastUpgradeable as SafeCast} from "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";

/// @dev Thrown for unsupported native transfers.
error UnsupportedNativeFlow();

/// @dev Thrown for unsupported erc20 transfers.
error UnsupportedERC20Flow();

/// @dev Thrown for unsupported erc721 transfers.
error UnsupportedERC721Flow();

/// @dev Thrown for unsupported erc1155 transfers.
error UnsupportedERC1155Flow();

/// @dev We want a sentinel with the following properties:
/// - Won't collide with token amounts (| with very large number)
/// - Won't collide with token addresses
/// - Won't collide with common values like `type(uint256).max` and
///   `type(uint256).min`
/// - Won't collide with other sentinels from unrelated contexts
uint256 constant RAIN_FLOW_SENTINEL = uint256(
    keccak256(bytes("RAIN_FLOW_SENTINEL")) | SENTINEL_HIGH_BITS
);

struct NativeTransfer {
    address from;
    address to;
    uint256 amount;
}

struct ERC20Transfer {
    address token;
    address from;
    address to;
    uint256 amount;
}

struct ERC721Transfer {
    address token;
    address from;
    address to;
    uint256 id;
}

struct ERC1155Transfer {
    address token;
    address from;
    address to;
    uint256 id;
    uint256 amount;
}

struct FlowTransfer {
    NativeTransfer[] native;
    ERC20Transfer[] erc20;
    ERC721Transfer[] erc721;
    ERC1155Transfer[] erc1155;
}

library LibFlow {
    using Address for address payable;
    using SafeERC20 for IERC20;
    using LibStackPointer for StackPointer;
    using SafeCast for uint256;
    using LibFlow for FlowTransfer;
    using LibUint256Array for uint256[];

    function stackToFlow(
        StackPointer stackBottom_,
        StackPointer stackTop_
    ) internal pure returns (FlowTransfer memory) {
        unchecked {
            FlowTransfer memory transfer_;
            uint256[] memory refs_;
            // native
            (stackTop_, refs_) = stackTop_.consumeStructs(
                stackBottom_,
                RAIN_FLOW_SENTINEL,
                3
            );
            assembly ("memory-safe") {
                mstore(transfer_, refs_)
            }
            // erc20
            (stackTop_, refs_) = stackTop_.consumeStructs(
                stackBottom_,
                RAIN_FLOW_SENTINEL,
                4
            );
            assembly ("memory-safe") {
                mstore(add(transfer_, 0x20), refs_)
            }
            // erc721
            (stackTop_, refs_) = stackTop_.consumeStructs(
                stackBottom_,
                RAIN_FLOW_SENTINEL,
                4
            );
            assembly ("memory-safe") {
                mstore(add(transfer_, 0x40), refs_)
            }
            // erc1155
            (stackTop_, refs_) = stackTop_.consumeStructs(
                stackBottom_,
                RAIN_FLOW_SENTINEL,
                5
            );
            assembly ("memory-safe") {
                mstore(add(transfer_, 0x60), refs_)
            }
            return transfer_;
        }
    }

    function flowNative(FlowTransfer memory flowTransfer_) internal {
        unchecked {
            uint256 youToMe_ = 0;
            uint256 meToYou_ = 0;
            NativeTransfer memory transfer_;
            for (uint256 i_ = 0; i_ < flowTransfer_.native.length; i_++) {
                transfer_ = flowTransfer_.native[i_];
                if (transfer_.from == msg.sender) {
                    if (transfer_.to != address(this)) {
                        revert UnsupportedNativeFlow();
                    }
                    youToMe_ += transfer_.amount;
                } else {
                    if (transfer_.from != address(this)) {
                        revert UnsupportedNativeFlow();
                    }
                    if (transfer_.to == msg.sender) {
                        meToYou_ += transfer_.amount;
                    } else {
                        payable(transfer_.to).sendValue(transfer_.amount);
                    }
                }
            }

            if (youToMe_ > 0) {
                // This will overflow if the msg.value is less than youToMe_.
                // Will refund any excess incoming value.
                meToYou_ += msg.value - youToMe_;
            }
            if (meToYou_ > 0) {
                payable(msg.sender).sendValue(meToYou_);
            }
        }
    }

    function flowERC20(FlowTransfer memory flowTransfer_) internal {
        unchecked {
            ERC20Transfer memory transfer_;
            for (uint256 i_ = 0; i_ < flowTransfer_.erc20.length; i_++) {
                transfer_ = flowTransfer_.erc20[i_];
                if (transfer_.from == msg.sender) {
                    IERC20(transfer_.token).safeTransferFrom(
                        msg.sender,
                        transfer_.to,
                        transfer_.amount
                    );
                } else if (transfer_.from == address(this)) {
                    IERC20(transfer_.token).safeTransfer(
                        transfer_.to,
                        transfer_.amount
                    );
                } else {
                    // We don't support `from` as anyone other than `you` or `me`
                    // as this would allow for all kinds of issues re: approvals.
                    revert UnsupportedERC20Flow();
                }
            }
        }
    }

    function flowERC721(FlowTransfer memory flowTransfer_) internal {
        unchecked {
            ERC721Transfer memory transfer_;
            for (uint256 i_ = 0; i_ < flowTransfer_.erc721.length; i_++) {
                transfer_ = flowTransfer_.erc721[i_];
                if (
                    transfer_.from != msg.sender &&
                    transfer_.from != address(this)
                ) {
                    revert UnsupportedERC721Flow();
                }
                IERC721(transfer_.token).safeTransferFrom(
                    transfer_.from,
                    transfer_.to,
                    transfer_.id
                );
            }
        }
    }

    function flowERC1155(FlowTransfer memory flowTransfer_) internal {
        unchecked {
            ERC1155Transfer memory transfer_;
            for (uint256 i_ = 0; i_ < flowTransfer_.erc1155.length; i_++) {
                transfer_ = flowTransfer_.erc1155[i_];
                if (
                    transfer_.from != msg.sender &&
                    transfer_.from != address(this)
                ) {
                    revert UnsupportedERC1155Flow();
                }
                // @todo safeBatchTransferFrom support.
                // @todo data support.
                IERC1155(transfer_.token).safeTransferFrom(
                    transfer_.from,
                    transfer_.to,
                    transfer_.id,
                    transfer_.amount,
                    ""
                );
            }
        }
    }

    function flow(
        FlowTransfer memory flowTransfer_,
        IInterpreterStoreV1 interpreterStore_,
        uint256[] memory kvs_
    ) internal {
        if (kvs_.length > 0) {
            interpreterStore_.set(DEFAULT_STATE_NAMESPACE, kvs_);
        }
        flowTransfer_.flowNative();
        flowTransfer_.flowERC20();
        flowTransfer_.flowERC721();
        flowTransfer_.flowERC1155();
    }
}
