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
  Debug,
} from "../../../../utils";

const Opcode = AllStandardOps;

describe("DO_WHILE Opcode test", async function () {
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

  it("should loop until reach atleast 10", async () => {
    const constants = [
      3, // An initial value
      2, // Value added on every loop
      10, // The minimum value necessary to stop the loop
    ];

    // prettier-ignore
    const sourceMAIN = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
        op(Opcode.LESS_THAN),
      // op(Opcode.DEBUG, Debug.StackIndex),
      // op(Opcode.DEBUG, Debug.Stack),
      op(Opcode.DO_WHILE, 1), // Source is on index 1
    ]);

    // prettier-ignore
    const sourceADD = concat([
      // op(Opcode.DEBUG, Debug.StackIndex),
      // op(Opcode.DEBUG, Debug.Stack),

          op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
          // op(Opcode.DEBUG, Debug.StackIndex),
          // op(Opcode.DEBUG, Debug.Stack),

        op(Opcode.ADD, 2),
        // op(Opcode.DEBUG, Debug.StackIndex),
        // op(Opcode.DEBUG, Debug.Stack),

        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
        // op(Opcode.DEBUG, Debug.StackIndex),
        // op(Opcode.DEBUG, Debug.Stack),

        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
        // op(Opcode.DEBUG, Debug.StackIndex),
        // op(Opcode.DEBUG, Debug.Stack),
        
      op(Opcode.LESS_THAN),
      // op(Opcode.DEBUG, Debug.StackIndex),
      // op(Opcode.DEBUG, Debug.Stack),
    ]);

    await logic.initialize({
      sources: [sourceMAIN, sourceADD],
      constants,
    });

    await logic.run();
    const result0 = await logic.stackTop();
    console.log("result0: ", result0.toString());

    const _stack = await logic.stack();
    console.log(_stack);
  });
});
