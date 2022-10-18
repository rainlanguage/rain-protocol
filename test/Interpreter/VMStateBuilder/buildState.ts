import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { StackHeightTest, StandardIntegrity } from "../../../typechain";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { assertError } from "../../../utils/test/assertError";

const Opcode = AllStandardOps;

describe("RainInterpreterIntegrity buildState", async function () {
  let integrity: StandardIntegrity;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory(
      "StandardIntegrity"
    );
    integrity = (await integrityFactory.deploy()) as StandardIntegrity;
    await integrity.deployed();
  });

  it("should enforce minimum stack height after eval", async () => {
    const stackHeightTestFactory = await ethers.getContractFactory(
      "StackHeightTest"
    );

    // test contract expects stack height of 2
    const stackHeightTest = (await stackHeightTestFactory.deploy(
      integrity.address
    )) as StackHeightTest;

    const constants = [1];

    // final stack height = 1
    // prettier-ignore
    const sources0 = [concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
    ])];

    // should fail with stack height < min stack height
    await assertError(
      async () =>
        await stackHeightTest.initialize({ sources: sources0, constants }),
      "MIN_FINAL_STACK",
      "did not enforce minimum stack height after eval"
    );

    // final stack height = 2
    // prettier-ignore
    const sources1 = [concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
    ])];

    // should pass with stack height = min stack height
    await stackHeightTest.initialize({ sources: sources1, constants });

    // final stack height = 3
    // prettier-ignore
    const sources2 = [concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
  ])];

    // should pass with stack height > min stack height
    await stackHeightTest.initialize({ sources: sources2, constants });
  });
});
