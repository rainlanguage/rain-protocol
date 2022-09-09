// SPDX-License-Identifier: CAL
pragma solidity 0.8.15;

import {Random} from "../../contracts/math/Random.sol";
import "../../contracts/sstore2/SSTORE2.sol";

contract RamdonTest {
    function microLottery(
        uint256 seed_,
        uint256 max_,
        uint256 n_
    ) external pure returns (uint256 item_) {
        return Random.microLottery(seed_, max_, n_);
    }

    function randomId(uint256 seed_, uint256 index_)
        external
        pure
        returns (uint256 item_)
    {
        return Random.randomId(seed_, index_);
    }

    function shuffle(uint256 seed_, uint256 len_)
        external
        pure
        returns (bytes memory shuffled_)
    {
        return Random.shuffle(seed_, len_);
    }

    function shuffleIdAtIndex(address ptr_, uint256 index_)
        external
        view
        returns (uint256 id_)
    {
        return Random.shuffleIdAtIndex(ptr_, index_);
    }
}

/// @title RandomEchidna
/// Wrapper around the `Random` library for echidna fuzz testing.
contract RandomEchidna {
    address internal shuffled;

    RamdonTest private _randomTest;

    event AssertionFailed();

    constructor() {
        _randomTest = new RamdonTest();
    }

    // Fuzz test to microLottery function catching the reverts
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
            // If revert with the conditions, then something else happened
            if (n_ < max_ && max_ <= type(uint8).max) {
                emit AssertionFailed();
            }
        }
    }

    // Fuzz test to randomId function
    function RandomId(uint256 seed_, uint256 index_) external {
        try _randomTest.randomId(seed_, index_) returns (
            uint256 outputValue1_
        ) {
            // Same seed should generate the same output
            uint256 outputValue2_ = _randomTest.randomId(seed_, index_);
            assert(outputValue1_ == outputValue2_);
        } catch {
            // It should not revert
            emit AssertionFailed();
        }
    }

    // Fuzz test to shuffle function
    // Limitation input to uint8 values to be able to reproduce a valid and complete run without expending
    // a large amount of gas and CPU power while processing
    function Shuffle(uint8 seed_, uint8 len_) external view {
        bytes memory shuffled1_ = _randomTest.shuffle(seed_, len_);
        bytes memory shuffled2_ = _randomTest.shuffle(seed_, len_);

        // The output is `len_` * 2 since generate uint16 values
        assert(shuffled1_.length == len_ * 2);

        // Same seed should generate the same output
        assert(
            keccak256(abi.encodePacked(shuffled1_)) ==
                keccak256(abi.encodePacked(shuffled2_))
        );
    }

    // Fuzz test to ShuffleIdAtIndex function
    // Limitation input to uint8 and uint16 values to be able to reproduce a valid and complete run without expending
    // a large amount of gas and CPU power while processing
    function ShuffleIdAtIndex(
        uint8 seed_,
        uint8 len_,
        uint16 index_
    ) external {
        uint256 seed = seed_;
        uint256 len = len_;
        uint256 index = index_;

        bytes memory shuffled_ = _randomTest.shuffle(seed, len);

        // Write the value to get the data address
        shuffled = SSTORE2.write(shuffled_);

        uint256 id = _randomTest.shuffleIdAtIndex(shuffled, index);

        if (index < len) {
            // Obtain the ID expected from the shuffled byte
            // [0] = [0-1]
            // [1] = [2-3]
            // [2] = [4-5]
            // [3] = [6-7]
            // [n] = [n * 2 - n * 2 + 1]
            bytes2 _bytesExpected = bytes2(
                bytes.concat(shuffled_[index_ * 2], shuffled_[index_ * 2 + 1])
            );

            uint256 idExpected = uint256(uint16(_bytesExpected));

            assert(id == idExpected);
        } else {
            // Index provided is Out Of Bound
            assert(id == 0);
        }
    }
}
