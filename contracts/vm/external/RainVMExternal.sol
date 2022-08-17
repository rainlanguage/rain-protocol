// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "./IRainVMExternal.sol";
import "hardhat/console.sol";
import"../ops/erc20/OpERC20BalanceOf.sol";

contract RainVMExternal is IRainVMExternal {

    string private constant _pointers = hex"01020304050607080910111213141516171819202122232425262728293031323311111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111";

    function pointerTo16BitString(function (uint[] memory) returns (uint[] memory) fn_) internal pure returns (string memory) {
        bytes memory bytes_ = new bytes(2);
        assembly ("memory-safe") {
            let offset_ := add(bytes_, 2)
            mstore(offset_, or(and(mload(offset_), not(0xFFFF)), and(fn_, 0xFFFF)))
        }
        return string(bytes_);
    }

    function pointers() public pure returns (string memory) {
        return string.concat(
            pointerTo16BitString(OpERC20BalanceOf.extern)
        );
    }

    function selfDestructIfPointersInvalid() external {
        if (keccak256(bytes(pointers())) != keccak256(bytes(_pointers))) {
            selfdestruct(payable(msg.sender));
        } 
    }

    function dispatch(uint opcode_, uint[] memory inputs_) external view returns (uint[] memory outputs_) {
        function(uint[] memory) internal view returns (uint[] memory) fn_;
        string memory pointers_ = _pointers;
        assembly ("memory-safe") {
            fn_ := and(mload(add(pointers_, mul(2, add(opcode_, 1)))), 0xFFFF)
        }
        return fn_(inputs_);
    }
}