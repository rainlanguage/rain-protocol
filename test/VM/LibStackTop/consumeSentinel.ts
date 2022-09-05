import { hexlify, keccak256 } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { LibStackTopTest } from "../../../typechain";

const SENTINEL_HIGH_BITS =
  "0xF000000000000000000000000000000000000000000000000000000000000000";
describe("LibStackTop consumeSentinel tests", async function () {
  let libStackTop: LibStackTopTest;

  before(async () => {
    const libStackTopFactory = await ethers.getContractFactory(
      "LibStackTopTest"
    );
    libStackTop = (await libStackTopFactory.deploy()) as LibStackTopTest;
  });

  it("should consume a sentinel", async () => {
    const array = [10, 20, 30, 40, 50, 60];
    const sentinel = ethers.BigNumber.from(
      keccak256([...Buffer.from("TEST")])
    ).or(SENTINEL_HIGH_BITS);
    const stepSize = 1;

    console.log({
      array,
      sentinel: hexlify(sentinel),
      stepSize,
    });

    const [stackTop_, array_] = await libStackTop.callStatic.consumeSentinel(
      array,
      sentinel,
      stepSize
    );

    console.log({ stackTop_, array_ });
  });
});
