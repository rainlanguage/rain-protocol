// SPDX-License-Identifier: CAL
pragma solidity ^0.8.15;

import "../../vm/runtime/LibStackTop.sol";
import {IERC20Upgradeable as IERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {SafeERC20Upgradeable as SafeERC20} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import {IERC721Upgradeable as IERC721} from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import {IERC1155Upgradeable as IERC1155} from "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";

// We want a sentinel with the following properties:
// - Won't collide with token amounts (| with very large number)
// - Won't collide with token addresses
// - Won't collide with common values like type(uint).max and type(uint).min
// - Won't collide with other sentinels from unrelated contexts
uint256 constant FLOW_SENTINEL = uint256(
    keccak256("RAIN_FLOW_SENTINEL") |
        bytes32(
            0xF000000000000000000000000000000000000000000000000000000000000000
        )
);

struct ERC20IO {
    address token;
    uint256 amount;
}

struct ERC721IO {
    address token;
    uint256 id;
}

struct ERC1155IO {
    address token;
    uint256 id;
    uint256 amount;
}

struct FlowIO {
    ERC20IO[] inputs20;
    ERC20IO[] outputs20;
    ERC721IO[] inputs721;
    ERC721IO[] outputs721;
    ERC1155IO[] inputs1155;
    ERC1155IO[] outputs1155;
}

library LibFlow {
    using SafeERC20 for IERC20;
    using LibStackTop for StackTop;

    function stackToFlow(StackTop stackBottom_, StackTop stackTop_)
        internal
        pure
        returns (FlowIO memory)
    {
        FlowIO memory flowIO_;
        uint256[] memory tempArray_;
        (stackTop_, tempArray_) = stackTop_.consumeSentinel(
            stackBottom_,
            FLOW_SENTINEL,
            2
        );
        assembly ("memory-safe") {
            mstore(tempArray_, div(mload(tempArray_), 2))
            mstore(add(flowIO_, 0x40), tempArray_)
        }
        (stackTop_, tempArray_) = stackTop_.consumeSentinel(
            stackBottom_,
            FLOW_SENTINEL,
            2
        );
        assembly ("memory-safe") {
            mstore(tempArray_, div(mload(tempArray_), 2))
            mstore(add(flowIO_, 0x60), tempArray_)
        }
        (stackTop_, tempArray_) = stackTop_.consumeSentinel(
            stackBottom_,
            FLOW_SENTINEL,
            2
        );
        assembly ("memory-safe") {
            mstore(tempArray_, div(mload(tempArray_), 2))
            mstore(add(flowIO_, 0x80), tempArray_)
        }
        (stackTop_, tempArray_) = stackTop_.consumeSentinel(
            stackBottom_,
            FLOW_SENTINEL,
            2
        );
        assembly ("memory-safe") {
            mstore(tempArray_, div(mload(tempArray_), 2))
            mstore(add(flowIO_, 0xA0), tempArray_)
        }
        (stackTop_, tempArray_) = stackTop_.consumeSentinel(
            stackBottom_,
            FLOW_SENTINEL,
            3
        );
        assembly ("memory-safe") {
            mstore(tempArray_, div(mload(tempArray_), 3))
            mstore(add(flowIO_, 0xC0), tempArray_)
        }
        (stackTop_, tempArray_) = stackTop_.consumeSentinel(
            stackBottom_,
            FLOW_SENTINEL,
            3
        );
        assembly ("memory-safe") {
            mstore(tempArray_, div(mload(tempArray_), 3))
            mstore(add(flowIO_, 0xE0), tempArray_)
        }
        return flowIO_;
    }

    function flow(
        FlowIO memory flowIO_,
        address me_,
        address you_
    ) internal {
        unchecked {
            if (flowIO_.inputs20.length > 0) {
                for (uint256 i_ = 0; i_ < flowIO_.inputs20.length; i_++) {
                    IERC20(flowIO_.inputs20[i_].token).safeTransferFrom(
                        you_,
                        me_,
                        flowIO_.inputs20[i_].amount
                    );
                }
            }
            if (flowIO_.outputs20.length > 0) {
                for (uint256 i_ = 0; i_ < flowIO_.outputs20.length; i_++) {
                    IERC20(flowIO_.outputs20[i_].token).safeTransferFrom(
                        me_,
                        you_,
                        flowIO_.outputs20[i_].amount
                    );
                }
            }
            if (flowIO_.inputs721.length > 0) {
                for (uint256 i_ = 0; i_ < flowIO_.inputs721.length; i_++) {
                    IERC721(flowIO_.inputs721[i_].token).safeTransferFrom(
                        you_,
                        me_,
                        flowIO_.inputs721[i_].id
                    );
                }
            }
            if (flowIO_.outputs721.length > 0) {
                for (uint256 i_ = 0; i_ < flowIO_.outputs721.length; i_++) {
                    IERC721(flowIO_.outputs721[i_].token).safeTransferFrom(
                        me_,
                        you_,
                        flowIO_.outputs721[i_].id
                    );
                }
            }
            if (flowIO_.inputs1155.length > 0) {
                // @todo safeBatchTransferFrom support.
                // @todo data support.
                for (uint256 i_ = 0; i_ < flowIO_.inputs1155.length; i_++) {
                    IERC1155(flowIO_.inputs1155[i_].token).safeTransferFrom(
                        you_,
                        me_,
                        flowIO_.inputs1155[i_].id,
                        flowIO_.inputs1155[i_].amount,
                        ""
                    );
                }
            }
            if (flowIO_.outputs1155.length > 0) {
                // @todo safeBatchTransferFrom support.
                // @todo data support.
                for (uint256 i_ = 0; i_ < flowIO_.outputs1155.length; i_++) {
                    IERC1155(flowIO_.outputs1155[i_].token).safeTransferFrom(
                        me_,
                        you_,
                        flowIO_.outputs1155[i_].id,
                        flowIO_.outputs1155[i_].amount,
                        ""
                    );
                }
            }
        }
    }
}
