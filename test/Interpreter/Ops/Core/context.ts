import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  AllStandardOpsTest,
  StandardIntegrity,
} from "../../../../typechain";
import { flatten2D } from "../../../../utils/array/flatten";
import { op } from "../../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../../utils/test/assertError";

const Opcode = AllStandardOps;

describe("RainInterpreter context", async function () {
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

  it("should support context height up to 256", async () => {
    const constants = [];
    const sources = [concat([op(Opcode.CONTEXT, 0xff00)])];

    await logic.initialize({ sources, constants });

    const col: number[] = [1];
    const context = new Array<number[]>(256).fill(col, 0, 256);
    await logic.runContext(context);
    const resultCol_ = await logic.stack();
    assert(resultCol_, "should read context value at 0xff00");
  });

  it("should support context width up to 256", async () => {
    const constants = [];
    const sources = [concat([op(Opcode.CONTEXT, 0x00ff)])];

    await logic.initialize({ sources, constants });

    const row: number[] = new Array<number>(256).fill(1, 0, 256);
    const context = [row];
    await logic.runContext(context);
    const resultRow_ = await logic.stack();
    assert(resultRow_, "should read context value at 0x00ff");
  });

  it("should error if accessing memory outside of context memory range", async () => {
    const constants = [];
    const sources = [concat([op(Opcode.CONTEXT, 3)])];

    await logic.initialize({ sources, constants });

    const data = [[10, 20, 30]];

    await assertError(
      async () => await logic.runContext(data),
      "Array accessed at an out-of-bounds or negative index",
      "did not error when accessing memory outside of context memory range"
    );
  });

  it("should not necessarily require square context matrix", async () => {
    const constants = [];
    const sources = [
      concat([
        op(Opcode.CONTEXT, 0x0000),
        op(Opcode.CONTEXT, 0x0001),
        op(Opcode.CONTEXT, 0x0002),
        op(Opcode.CONTEXT, 0x0003),
        op(Opcode.CONTEXT, 0x0100),
        op(Opcode.CONTEXT, 0x0101),
        op(Opcode.CONTEXT, 0x0102),
        op(Opcode.CONTEXT, 0x0103),
        op(Opcode.CONTEXT, 0x0200),
        op(Opcode.CONTEXT, 0x0201),
        op(Opcode.CONTEXT, 0x0202), // OOB read
      ]),
    ];

    await logic.initialize({ sources, constants });

    const context = [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9], // no value at (2,2)
    ];

    assertError(
      async () => await logic.runContext(context),
      "VM Exception while processing transaction: reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)",
      "did not trigger OOB read error"
    );
  });

  it("should return correct context value when specifying context operand for 2D context", async () => {
    const constants = [];
    const sources = [
      concat([
        op(Opcode.CONTEXT, 0x0000),
        op(Opcode.CONTEXT, 0x0001),
        op(Opcode.CONTEXT, 0x0002),
        op(Opcode.CONTEXT, 0x0003),
        op(Opcode.CONTEXT, 0x0100),
        op(Opcode.CONTEXT, 0x0101),
        op(Opcode.CONTEXT, 0x0102),
        op(Opcode.CONTEXT, 0x0103),
        op(Opcode.CONTEXT, 0x0200),
        op(Opcode.CONTEXT, 0x0201),
      ]),
    ];

    await logic.initialize({ sources, constants });

    const context = [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9],
    ];

    await logic.runContext(context);

    const result_ = await logic.stack();

    const expectedFlattenedContext = flatten2D(context);

    expectedFlattenedContext.forEach((expectedValue, i_) => {
      assert(
        result_[i_].eq(expectedValue),
        `wrong value was returned at index ${i_}
        expected  ${expectedValue}
        got       ${result_[i_]}`
      );
    });
  });

  it("should return correct context value when specifying context operand for 1D context", async () => {
    const constants = [];
    const sources = [
      concat([
        op(Opcode.CONTEXT),
        op(Opcode.CONTEXT, 1),
        op(Opcode.CONTEXT, 2),
      ]),
    ];

    await logic.initialize({ sources, constants });

    const context = [[10, 20, 30]];

    await logic.runContext(context);

    const result_ = await logic.stack();

    context[0].forEach((expectedValue, i_) => {
      assert(
        result_[i_].eq(expectedValue),
        `wrong value was returned at index ${i_}
        expected  ${expectedValue}
        got       ${result_[i_]}`
      );
    });
  });

  it("should support adding new data to stack at runtime via CONTEXT opcode", async () => {
    const constants = [];
    const sources = [concat([op(Opcode.CONTEXT)])];

    await logic.initialize({ sources, constants });

    const data = [[42]];

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
