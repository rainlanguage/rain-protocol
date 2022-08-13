import { assert, expect } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllStandardOpsIntegrity } from "../../../../typechain/AllStandardOpsIntegrity";
import type { AllStandardOpsTest } from "../../../../typechain/AllStandardOpsTest";
import { ReadWriteTier } from "../../../../typechain/ReadWriteTier";
import { TierReportTest } from "../../../../typechain/TierReportTest";
import {
  AllStandardOps,
  op,
  memoryOperand,
  MemoryType,
  callOperand,
  assertError,
  getBlockTimestamp,
  Tier,
  basicDeploy,
  timewarp,
  loopNOperand,
} from "../../../../utils";

const Opcode = AllStandardOps;

describe("LOOP_N Opcode test", async function () {
  let stateBuilder: AllStandardOpsIntegrity;
  let logic: AllStandardOpsTest;

  before(async () => {
    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsIntegrity"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as AllStandardOpsIntegrity;
    await stateBuilder.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      stateBuilder.address
    )) as AllStandardOpsTest;
  });

  xit("should loop the source N times", async () => {
    const constants = [2, 5];

    // Loop source[1] for 2 times
    const loopADD = op(Opcode.LOOP_N, loopNOperand(2, 1));

    // Source to add 2 numbers, input will be provided from another source
    // prettier-ignore
    const sourceADD = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.ADD, 2),
    ]);

    // prettier-ignore
    const sourceMAIN = concat([
        loopADD
    ]);

    await logic.initialize({
      sources: [sourceMAIN, sourceADD],
      constants,
    });

    await logic.run();
    const result0 = await logic.stackTop();
    console.log("\n\n", result0);
    console.log(await logic.stack());
    // const expectedResult0 = ethers.BigNumber.from("5");
    // assert(
    //   result0.eq(expectedResult0),
    //   `Invalid output, expected ${expectedResult0}, actual ${result0}`
    // );
  });

});
