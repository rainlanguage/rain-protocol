// SPDX-License-Identifier: CAL
pragma solidity =0.8.18;

import {SeedDance, Seed} from "../../contracts/dance/SeedDance.sol";

import {SeedDanceTest} from "../../contracts/test/dance/SeedDance/SeedDanceTest.sol";

// TODO: Continue implementing a valid test flow

/// @title SeedDanceEchidna
/// Wrapper around the `SeedDance` contract for echidna fuzz testing.
contract SeedDanceEchidna {
    bytes4 private errorMsgBytes = 0x08c379a0; // Code bytes on the data reason that represent revert with msg error.

    SeedDanceTest private _seedDanceTest;

    event AssertionFailed();

    constructor() {
        _seedDanceTest = new SeedDanceTest();
    }

    function start(Seed initialSeed_) external {
        try _seedDanceTest.start(initialSeed_) {
            assert(
                Seed.unwrap(_seedDanceTest.sharedSeed()) ==
                    Seed.unwrap(initialSeed_)
            );
        } catch (bytes memory reason) {
            bytes memory message_ = _getReason(reason);

            bytes memory startedMessageBytes = abi.encodePacked(
                bytes32("STARTED")
            );

            assert(keccak256(message_) == keccak256(startedMessageBytes));
        }
    }

    function _getReason(
        bytes memory reason_
    ) private view returns (bytes memory) {
        bytes memory dataError = new bytes(4);
        for (uint256 i = 0; i < 4; i++) {
            dataError[i] = reason_[i];
        }

        assert( // We only allow non-critical errors
            keccak256(dataError) == keccak256(abi.encodePacked(errorMsgBytes))
        );

        uint256 loopsReason = (reason_.length - 4) / 32;

        bytes[] memory datas = new bytes[](loopsReason);

        for (uint256 i = 0; i < loopsReason; i++) {
            bytes memory dataLoop = new bytes(32);
            uint256 start_ = (i * 32) + 4;
            for (uint256 j = 0; j < 32; j++) {
                dataLoop[j] = reason_[start_ + j];
            }
            datas[i] = dataLoop;
        }

        // The index 0 will be the offset
        // The index 1 will be the string message length
        // The index 2 and greater will be the message
        uint256 msgLength_ = uint256(bytes32(datas[1]));

        uint256 _loops = msgLength_ / 32;
        bytes memory _concats = bytes.concat(datas[2]);

        for (uint256 i = 1; i < _loops; i++) {
            _concats = bytes.concat(_concats, datas[i + 2]);
        }

        return _concats;
    }
}
