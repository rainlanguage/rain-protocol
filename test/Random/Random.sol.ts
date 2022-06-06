import * as Util from "../../utils"
import type { RandomTest } from "../../typechain/RandomTest";
import type { Contract } from "ethers";

describe("Random", async function() {
    describe("Micro lottery", async function() {
        it("should return a value for the micro lottery", async function() {
            const random = (await Util.basicDeploy("RandomTest", {})) as RandomTest & Contract;

            for (let seed of [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000]) {
                console.log('seed', seed)
                await random.microLottery(seed, 30, 0)
                console.log(await random.item())
            }

        })
    })
})