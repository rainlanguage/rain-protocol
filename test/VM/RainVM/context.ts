import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllStandardOpsStateBuilder } from "../../../typechain/AllStandardOpsStateBuilder";
import { AllStandardOpsTest } from "../../../typechain/AllStandardOpsTest";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { op, memoryOperand, MemoryType } from "../../../utils/rainvm/vm";
import { assertError } from "../../../utils/test/assertError";

const Opcode = AllStandardOps;

describe("RainVM context", async function () {
  let stateBuilder: AllStandardOpsStateBuilder;
  let logic: AllStandardOpsTest;

  before(async () => {
    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsStateBuilder"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as AllStandardOpsStateBuilder;
    await stateBuilder.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      stateBuilder.address
    )) as AllStandardOpsTest;
  });

  it("should error if accessing memory outside of context memory range", async () => {
    const constants = [];
    const sources = [
      concat([op(Opcode.CONTEXT, 3)]),
    ];

    await logic.initialize({ sources, constants });

    const data = [10, 20, 30];

    await assertError(
      async () => await logic.runContext(data),
      "CONTEXT_LENGTH",
      "did not error when accessing memory outside of context memory range"
    );
  });

  it("should return correct context value when specifying context operand", async () => {
    const constants = [];
    const sources = [
      concat([
        op(Opcode.CONTEXT),
        op(Opcode.CONTEXT, 1),
        op(Opcode.CONTEXT, 2),
      ]),
    ];

    await logic.initialize({ sources, constants });

    const data = [10, 20, 30];

    await logic.runContext(data);

    const result = await logic.stack();
    const expected = data;

    expected.forEach((expectedValue, index) => {
      console.log({ expectedValue, actualValue: result[index] });
      assert(
        result[index].eq(expectedValue),
        `wrong value was returned at index ${index}
        expected  ${expectedValue}
        got       ${result[index]}`
      );
    });
  });

  it("should support adding new data to stack at runtime via CONTEXT opcode", async () => {
    const constants = [];
    const sources = [
      concat([op(Opcode.CONTEXT)]),
    ];

    await logic.initialize({ sources, constants });

    const data = [42];

    await logic.runContext(data);

    const result = await logic.stackTop();
    const expected = 42;

    assert(
      result.eq(expected),
      `wrong value was returned
      expected  ${expected}
      got       ${result}`
    );
  });
});
