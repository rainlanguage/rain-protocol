// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "./IRainVMExternal.sol";
import "hardhat/console.sol";
import "../ops/erc20/OpERC20BalanceOf.sol";
import "../ops/math/OpAdd.sol";

contract RainVMExternal is IRainVMExternal {
    function dispatch(uint256 opcode_, uint256[] memory inputs_)
        external
        view
        returns (uint256[] memory outputs_)
    {
        function(uint256[] memory) internal view returns (uint256[] memory) fn_;
        bytes memory pointers_ = hex"00010002";
        assembly ("memory-safe") {
            fn_ := and(mload(add(pointers_, mul(2, add(opcode_, 1)))), 0xFFFF)
        }
        return fn_(inputs_);
    }

    function pointerTo16Bits(
        function(uint256[] memory) view returns (uint256[] memory) fn_
    ) internal pure returns (bytes memory) {
        bytes memory bytes_ = new bytes(2);
        assembly ("memory-safe") {
            let offset_ := add(bytes_, 2)
            mstore(
                offset_,
                or(and(mload(offset_), not(0xFFFF)), and(fn_, 0xFFFF))
            )
        }
        return bytes_;
    }

    function pointers() external view {
        console.logBytes(
            bytes.concat(
                pointerTo16Bits(OpERC20BalanceOf.extern),
                pointerTo16Bits(OpAdd.extern)
            )
        );
    }
}
