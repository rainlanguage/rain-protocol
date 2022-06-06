import * as Util from "../../utils"
import type { RandomTest } from "../../typechain/RandomTest";
import type { Contract } from "ethers";

import { assert } from "chai";

describe("Random", async function() {
    describe("Micro lottery", async function() {
        it("should return a value for the micro lottery", async function() {
            const random = (await Util.basicDeploy("RandomTest", {})) as RandomTest & Contract;

            const max = 30
            for (let seed of [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000]) {
                console.log('seed', seed)
                let arr = []
                for (let n = 0; n < max; n++) {
                    await random.microLottery(seed, max, n)
                    arr.push((await random.item()).toString())
                }
                let set = new Set(arr)
                console.log(arr)
                console.log(set)
                assert(set.size === arr.length, 'set and array different length')
                assert(arr.length === max, 'array not length of max')
                for (let j = 0; j < max; j++) {
                    assert(set.has(j + ''), `item missing: ${j}`)
                }
            }

        })
    })
})