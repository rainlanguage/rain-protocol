import { ethers } from "hardhat";
import type { LibVMStateTest } from "../../../typechain/LibVMStateTest";
import { compareStructs } from "../../../utils/test/compareStructs";

describe("LibVMState fromBytesPacked tests", async function () {
  let libStackTop: LibVMStateTest;

  before(async () => {
    const libStackTopFactory = await ethers.getContractFactory(
      "LibVMStateTest"
    );
    libStackTop = (await libStackTopFactory.deploy()) as LibVMStateTest;
  });

  it("should convert packed bytes to VMState with fromBytesPacked", async () => {
    const ptrSources = [
      Uint8Array.from([5, 6, 7, 8]),
      Uint8Array.from([4, 3, 2, 1]),
    ];

    const state_ = await libStackTop.callStatic.fromBytesPacked(ptrSources);

    const expectedState = {
      stackBottom: 1728,
      constantsBottom: 1248,
      context: [0, 0, 0, 0, 0],
      ptrSources: ["0x05060708", "0x04030201"],
    };

    compareStructs(state_, expectedState);
  });
});
