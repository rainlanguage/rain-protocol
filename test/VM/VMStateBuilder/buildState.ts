import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllStandardOpsStateBuilder } from "../../../typechain/AllStandardOpsStateBuilder";
import { StackHeightTest } from "../../../typechain/StackHeightTest";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { op, memoryOperand, MemoryType } from "../../../utils/rainvm/vm";
import { assertError } from "../../../utils/test/assertError";

const Opcode = AllStandardOps;

describe("VMStateBuilder buildState", async function () {
  let stateBuilder: AllStandardOpsStateBuilder;

  before(async () => {
    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsStateBuilder"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as AllStandardOpsStateBuilder;
    await stateBuilder.deployed();
  });

  it("should enforce minimum stack height after eval", async () => {
    const stackHeightTestFactory = await ethers.getContractFactory(
      "StackHeightTest"
    );

    // test contract expects stack height of 2
    const stackHeightTest = (await stackHeightTestFactory.deploy(
      stateBuilder.address
    )) as StackHeightTest;

    const constants = [1];

    // final stack height = 1
    // prettier-ignore
    const sources0 = [concat([
      op(Opcode.MEMORY, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.MEMORY, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.ADD, 2),
    ])];

    // should fail with stack height < min stack height
    await assertError(
      async () =>
        await stackHeightTest.initialize({ sources: sources0, constants }),
      "FINAL_STACK_INDEX",
      "did not enforce minimum stack height after eval"
    );

    // final stack height = 2
    // prettier-ignore
    const sources1 = [concat([
      op(Opcode.MEMORY, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.MEMORY, memoryOperand(MemoryType.Constant, 0)),
    ])];

    // should pass with stack height = min stack height
    await stackHeightTest.initialize({ sources: sources1, constants });

    // final stack height = 3
    // prettier-ignore
    const sources2 = [concat([
      op(Opcode.MEMORY, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.MEMORY, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.MEMORY, memoryOperand(MemoryType.Constant, 0)),
  ])];

    // should pass with stack height > min stack height
    await stackHeightTest.initialize({ sources: sources2, constants });
  });
});
