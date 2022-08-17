import { assert, expect } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { StandardIntegrity } from "../../../../typechain/StandardIntegrity";
import type { AllStandardOpsTest } from "../../../../typechain/AllStandardOpsTest";
import { RainVMExternal } from "../../../../typechain/RainVMExternal";
import { ReadWriteTier } from "../../../../typechain/ReadWriteTier";
import { TierReportTest } from "../../../../typechain/TierReportTest";
import {
  AllStandardOps,
  op,
  memoryOperand,
  MemoryType,
  loopNOperand,
  callExternalOperand,
  getBlockTimestamp,
  Tier,
  basicDeploy,
  timewarp,
} from "../../../../utils";

const Opcode = AllStandardOps;

describe.only("CALL_EXTERNAL Opcode test", async function () {
  let integrity: StandardIntegrity;
  let logic: AllStandardOpsTest;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory(
      "StandardIntegrity"
    );
    integrity = (await integrityFactory.deploy()) as StandardIntegrity;
    await integrity.deployed();

    const externalFactory = await ethers.getContractFactory(
      "RainVMExternal"
    );
    const extern = (await externalFactory.deploy()) as RainVMExternal;
    await extern.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      integrity.address,
      extern.address,
    )) as AllStandardOpsTest;
  });

  it("should run CALL_EXTERNAL", async () => {
    const constants = [1];

    // Source to add 2 numbers, input will be provided from another source
    const sourceCONSTANT = concat([op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0))]);

    // Source for calculating fibonacci sequence uptill 5
    // prettier-ignore
    const sourceMAIN = concat([
      op(Opcode.LOOP_N, loopNOperand(5, 1)),
      op(Opcode.CALL_EXTERNAL, callExternalOperand(5, 1, 1)),
    ]);

    await logic.initialize({
      sources: [sourceMAIN, sourceCONSTANT],
      constants,
    });

    await logic.run();
    const result0 = await logic.stackTop();
    const expectedResult0 = ethers.BigNumber.from("5");
    assert(
      result0.eq(expectedResult0),
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );
  });


});
