// SPDX-License-Identifier: CAL
pragma solidity 0.8.15;

import {Random} from "../../contracts/math/Random.sol";

contract RamdonTest {
    function microLottery(
        uint256 seed_,
        uint256 max_,
        uint256 n_
    ) external pure returns (uint256 item_) {
        return Random.microLottery(seed_, max_, n_);
    }
}

/// @title RandomEchidna
/// Wrapper around the `Random` library for echidna fuzz testing.
contract RandomEchidna {
    bytes4 private panicBytes = 0x4e487b71; // Code bytes on the data reason that represent Panic(uint256)
    bytes4 private errorMsgBytes = 0x08c379a0; // Code bytes on the data reason that represent Error(string)
    bytes1 private errorCodeUFOF = 0x11; // Error code bytes on the data reason that represent Overflow or Underflow
    bytes1 private errorCodeByZero = 0x12; // Error code bytes on the data reason that represent division or modulo by zero

    event AssertionFailed();
    event AssertionFailed(string);

    RamdonTest private _randomTest;

    constructor() {
        _randomTest = new RamdonTest();
    }

    // Fuzz test to
    function MicroLottery(
        uint256 seed_,
        uint256 max_,
        uint256 n_
    ) external {
        try _randomTest.microLottery(seed_, max_, n_) returns (
            uint256 outputValue1_
        ) {
            // Same seed should generate the same output
            uint256 outputValue2_ = _randomTest.microLottery(seed_, max_, n_);

            assert(outputValue1_ == outputValue2_);
        } catch {
            if (n_ < max_ && max_ <= type(uint8).max) {
                emit AssertionFailed();
            }
        }
    }

    function _getReason(bytes memory reason_) private view {
        bytes memory dataError = new bytes(4);
        for (uint256 i = 0; i < 4; i++) {
            dataError[i] = reason_[i];
        }

        assert( // We only allow non-critical errors
            keccak256(dataError) == keccak256(abi.encodePacked(errorMsgBytes))
        );

        uint256 loopsI = (reason_.length - 4) / 32;

        bytes[] memory datas = new bytes[](loopsI);

        for (uint256 i = 0; i < loopsI; i++) {
            bytes memory dataLoop = new bytes(32);
            uint256 start = (i * 32) + 4;
            for (uint256 j = 0; j < 32; j++) {
                dataLoop[j] = reason_[start + j];
            }
            datas[i] = dataLoop;
        }

        // The index 0 will be the offset
        // The index 1 will be the string message length
        // The index 2 and greater will be the message
        uint256 msgLength_ = uint256(bytes32(datas[1]));
        string memory message_;

        uint256 _loops = msgLength_ / 32;
        bytes memory _concats = bytes.concat(datas[2]);

        for (uint256 i = 1; i < _loops; i++) {
            _concats = bytes.concat(_concats, datas[i + 2]);
        }
        message_ = bytesToString(_concats);

        // console.log(message_); // Assert the msg (??)
    }

    function utfStringLength(string memory str)
        internal
        pure
        returns (uint256 length)
    {
        uint256 i = 0;
        bytes memory string_rep = bytes(str);

        while (i < string_rep.length) {
            if (string_rep[i] >> 7 == 0) i += 1;
            else if (string_rep[i] >> 5 == bytes1(uint8(0x6))) i += 2;
            else if (string_rep[i] >> 4 == bytes1(uint8(0xE))) i += 3;
            else if (string_rep[i] >> 3 == bytes1(uint8(0x1E)))
                i += 4;
                //For safety
            else i += 1;

            length++;
        }
    }

    function bytesToString(bytes memory byteCode)
        private
        pure
        returns (string memory stringData)
    {
        uint256 blank = 0; //blank 32 byte value
        uint256 length = byteCode.length;

        uint256 cycles = byteCode.length / 0x20;
        uint256 requiredAlloc = length;

        if (
            length % 0x20 > 0
        ) //optimise copying the final part of the bytes - to avoid looping with single byte writes
        {
            cycles++;
            requiredAlloc += 0x20; //expand memory to allow end blank, so we don't smack the next stack entry
        }

        stringData = new string(requiredAlloc);

        //copy data in 32 byte blocks
        assembly {
            let cycle := 0

            for {
                let mc := add(stringData, 0x20) //pointer into bytes we're writing to
                let cc := add(byteCode, 0x20) //pointer to where we're reading from
            } lt(cycle, cycles) {
                mc := add(mc, 0x20)
                cc := add(cc, 0x20)
                cycle := add(cycle, 0x01)
            } {
                mstore(mc, mload(cc))
            }
        }

        //finally blank final bytes and shrink size (part of the optimisation to avoid looping adding blank bytes1)
        if (length % 0x20 > 0) {
            uint256 offsetStart = 0x20 + length;
            assembly {
                let mc := add(stringData, offsetStart)
                mstore(mc, mload(add(blank, 0x20)))
                //now shrink the memory back so the returned object is the correct size
                mstore(stringData, length)
            }
        }
    }
}
