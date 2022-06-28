// SPDX-License-Identifier: CAL
pragma solidity =0.8.10;

import "../vm/VMStateBuilder.sol";
import "../vm/ops/AllStandardOps.sol";
import "./OrderBook.sol";
import "../memory/coerce/CoerceBytes.sol";
import "../memory/coerce/CoerceFnPtrs.sol";

contract OrderBookStateBuilder is VMStateBuilder {
    function localStackPopsFnPtrs()
        internal
        pure
        returns (uint256[] memory ptrs_)
    {
        unchecked {
            uint256[LOCAL_OPS_LENGTH + 1] memory fns_ = [
                // will be overriden with length
                LOCAL_OPS_LENGTH,
                // order funds cleared
                CoerceFnPtrs.toUint256(AllStandardOps.one),
                // order counterparty funds cleared
                CoerceFnPtrs.toUint256(AllStandardOps.two)
            ];
            assembly {
                ptrs_ := fns_
            }
        }
    }

    function localStackPushesFnPtrs()
        internal
        pure
        returns (uint256[] memory ptrs_)
    {
        unchecked {
            uint256[LOCAL_OPS_LENGTH + 1] memory fns_ = [
                // will be overriden with length
                LOCAL_OPS_LENGTH,
                // order funds cleared
                CoerceFnPtrs.toUint256(AllStandardOps.one),
                // order counterparty funds cleared
                CoerceFnPtrs.toUint256(AllStandardOps.one)
            ];
            assembly {
                ptrs_ := fns_
            }
        }
    }

    /// @inheritdoc VMStateBuilder
    function stackPopsFnPtrs() public pure override returns (uint256[] memory) {
        return
            CoerceBytes.toUint256Array(
                bytes.concat(
                    CoerceBytes.fromUint256Array(
                        AllStandardOps.stackPopsFnPtrs()
                    ),
                    CoerceBytes.fromUint256Array(localStackPopsFnPtrs())
                )
            );
    }

    /// @inheritdoc VMStateBuilder
    function stackPushesFnPtrs()
        public
        pure
        override
        returns (uint256[] memory)
    {
        return
            CoerceBytes.toUint256Array(
                bytes.concat(
                    CoerceBytes.fromUint256Array(
                        AllStandardOps.stackPushesFnPtrs()
                    ),
                    CoerceBytes.fromUint256Array(localStackPushesFnPtrs())
                )
            );
    }
}
