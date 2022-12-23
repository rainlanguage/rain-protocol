// SPDX-License-Identifier: CAL
pragma solidity =0.8.17;

import "../../../math/Random.sol";
import "../../../sstore2/SSTORE2.sol";

contract RandomTest {
    address public shuffled;

    uint256 private val;

    function microLottery(
        uint256 seed_,
        uint256 max_,
        uint256 n_
    ) external pure returns (uint256 item_) {
        // uint256 a_ = gasleft();
        item_ = Random.microLottery(seed_, max_, n_);
        // uint256 b_ = gasleft();
        // console.log("microLottery gas used: %s", a_ - b_);
    }

    function shuffle(
        uint256 seed_,
        uint256 len_
    ) external returns (bytes memory shuffled_) {
        // uint256 a_ = gasleft();
        shuffled_ = Random.shuffle(seed_, len_);
        // uint256 b_ = gasleft();
        // console.log(
        //     "shuffle gas used: %s %s %s",
        //     len_,
        //     a_ - b_,
        //     (a_ - b_) / len_
        // );
        // a_ = gasleft();
        shuffled = SSTORE2.write(shuffled_);
        // b_ = gasleft();
        // console.log("storage gas used: %s", a_ - b_);
    }

    function shuffleIdAtIndex(uint256 index_) external returns (uint256 id_) {
        // Write something so we can see gas costs.
        val = 1;
        // uint256 a_ = gasleft();
        address shuffled_ = shuffled;

        id_ = Random.shuffleIdAtIndex(shuffled_, index_);
        // uint256 b_ = gasleft();
        // console.log("shuffle id: %s", id_);
        // console.log("shuffle index gas: %s", a_ - b_);

        uint256 index2_ = index_ + 1;
        // a_ = gasleft();
        Random.shuffleIdAtIndex(shuffled_, index2_);
        // b_ = gasleft();
        // console.log("shuffle index gas 2: %s", a_ - b_);
    }

    function randomId(
        uint256 seed_,
        uint256 index_
    ) external returns (uint256 id_) {
        // write something so we can see gas costs.
        val = 2;

        // uint256 a_ = gasleft();
        id_ = Random.randomId(seed_, index_);
        // uint256 b_ = gasleft();

        // console.log("random id: %s", id_);
        // console.log("random gas: %s", a_ - b_);
    }
}
