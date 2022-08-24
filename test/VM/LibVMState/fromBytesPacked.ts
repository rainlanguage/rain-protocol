import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { LibVMStateTest } from "../../../typechain/LibVMStateTest";
import { Opcode } from "../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../utils/rainvm/vm";
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
    // prettier-ignore
    const sources = [
      concat([ // sourceIndex 0
        op(Opcode.BLOCK_NUMBER)
      ]),
      concat([ // sourceIndex 1
          op(Opcode.BLOCK_NUMBER),
        op(Opcode.EXPLODE32),
      ])
    ];

    const state_ = await libStackTop.callStatic.fromBytesPacked(sources);

    const expectedState = {
      stackBottom: 3296,
      constantsBottom: 2816,
      context: [0, 0, 0, 0, 0],
      compiledSources: ["0x0ffe0000", "0x0ffe000010360000"],
    };

    compareStructs(state_, expectedState);
  });
});
