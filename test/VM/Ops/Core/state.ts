import { expect } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { StandardIntegrity } from "../../../../typechain/StandardIntegrity";
import type { AllStandardOpsTest } from "../../../../typechain/AllStandardOpsTest";
import {
  AllStandardOps,
  assertError,
  getBlockTimestamp,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";

const Opcode = AllStandardOps;

describe("STATE Opcode test", async function () {
  let integrity: StandardIntegrity;
  let logic: AllStandardOpsTest;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory(
      "StandardIntegrity"
    );
    integrity = (await integrityFactory.deploy()) as StandardIntegrity;
    await integrity.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      integrity.address
    )) as AllStandardOpsTest;
  });

  it("should read a value from constants and place it on the stack", async () => {
    const constants = [1337];
    // prettier-ignore
    const sourceMAIN = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
    ]);

    await logic.initialize({
      sources: [sourceMAIN],
      constants: constants,
    });

    await logic.run();
    const result0 = await logic.stackTop();
    const expectedResult0 = ethers.BigNumber.from(1337);
    expect(result0).deep.equal(
      expectedResult0,
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );
  });

  it("should read a value from stack and place it on the stack", async () => {
    const constants = [1337];
    // prettier-ignore
    const sourceMAIN = concat([
        op(Opcode.BLOCK_TIMESTAMP),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 1)),
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
    ]);

    await logic.initialize({
      sources: [sourceMAIN],
      constants: constants,
    });

    await logic.run();
    const expectedTimeStamp = await getBlockTimestamp();

    const result0 = await logic.stack();
    const expectedResult0 = [
      ethers.BigNumber.from(expectedTimeStamp),
      ethers.BigNumber.from(1337),
      ethers.BigNumber.from(1337),
      ethers.BigNumber.from(expectedTimeStamp),
    ];

    console.log(result0);
    console.log(expectedResult0);

    expect(result0).deep.equal(
      expectedResult0,
      `Invalid output, expected ${expectedResult0}, actual ${result0}`
    );
  });

  it("should fail when reading an OOB stack value", async () => {
    const constants = [1337];
    // prettier-ignore
    const sourceMAIN = concat([
        op(Opcode.BLOCK_TIMESTAMP),
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Stack, 2)), // Reading an OOB value
    ]);

    await assertError(
      async () =>
        await logic.initialize({
          sources: [sourceMAIN],
          constants: constants,
        }),
      "OOB_STACK_READ",
      "Integrity check failed while reading an OOB stack value"
    );
  });
  
  it("should fail when reading an OOB constant value", async () => {
    const constants = [1337];
    // prettier-ignore
    const sourceMAIN = concat([
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)), // Reading an OOB value
    ]);

    await assertError(
      async () =>
        await logic.initialize({
          sources: [sourceMAIN],
          constants: constants,
        }),
      "OOB_CONSTANT_READ",
      "Integrity check failed while reading an OOB constant value"
    );
  });
});
