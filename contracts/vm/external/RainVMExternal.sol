// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "./IRainVMExternal.sol";
import "hardhat/console.sol";
import "../ops/erc20/OpERC20BalanceOf.sol";
import "../ops/math/OpAdd.sol";

contract RainVMExternal is IRainVMExternal {
    function dispatch(uint opcode_, uint[] calldata inputs_) external view returns (uint[] memory outputs_) {
        function(uint[] calldata) internal view returns (uint[] memory) fn_;
        bytes memory pointers_ = hex"01fa02a6";
        assembly ("memory-safe") {
            fn_ := and(
                mload(
                    add(
                        pointers_, 
                        mul(
                            2, 
                            add(opcode_, 1)
                        )
                    )
                ), 
                0xFFFF
            )
        }
        uint a_ = gasleft();
        outputs_ = fn_(inputs_);
        uint b_ = gasleft();
        console.log("gas", a_ - b_);
        // return fn_(inputs_);
    }

    function pointerTo16Bits(function (uint[] calldata) view returns (uint[] memory) fn_) internal pure returns (bytes memory) {
        bytes memory bytes_ = new bytes(2);
        assembly ("memory-safe") {
            let offset_ := add(bytes_, 2)
            mstore(offset_, or(and(mload(offset_), not(0xFFFF)), and(fn_, 0xFFFF)))
        }
        return bytes_;
    }

    function pointers() external view {
        console.logBytes(bytes.concat(
            pointerTo16Bits(OpERC20BalanceOf.extern),
            pointerTo16Bits(OpAdd.extern)
        ));
    }

    // function selfDestructIfPointersInvalid() external {
    //     if (keccak256(bytes(pointers())) != keccak256(bytes(_pointers))) {
    //         selfdestruct(payable(msg.sender));
    //     } 
    // }


}