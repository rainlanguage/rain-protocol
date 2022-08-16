// SPDX-License-Identifier: CAL
pragma solidity =0.8.15;

import "hardhat/console.sol";

contract RainVMExternal {

    string private constant _pointers = hex"01020304050607080910111213141516171819202122232425262728293031323311111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111";

    function foo() internal pure returns (uint) {
        return 1;
    }

    function pointerTo16BitString(function () returns (uint) fn_) internal pure returns (string memory) {
        bytes memory bytes_ = new bytes(2);
        assembly ("memory-safe") {
            let offset_ := add(bytes_, 2)
            mstore(offset_, or(and(mload(offset_), not(0xFFFF)), and(fn_, 0xFFFF)))
        }
        return string(bytes_);
    }

    function pointers() public pure returns (string memory) {
        return string.concat(
            pointerTo16BitString(foo)
        );
    }

    function selfDestructIfPointersInvalid() external {
        if (keccak256(bytes(pointers())) != keccak256(bytes(_pointers))) {
            selfdestruct(payable(msg.sender));
        } 
    }
}