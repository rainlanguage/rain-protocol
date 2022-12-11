import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import type { AllStandardOpsTest } from "../../../../typechain";
import { flatten2D } from "../../../../utils/array/flatten";
import { allStandardOpsDeploy } from "../../../../utils/deploy/test/allStandardOps/deploy";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../../utils/test/assertError";

const Opcode = AllStandardOps;

describe("RainInterpreter CONTEXT_ROW", async function () {
  let logic: AllStandardOpsTest;

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it("should support context height [COLUMN] up to 16", async () => {
    const constants = [0];
    const sources = [
      concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.CONTEXT_ROW, 0x0f),
      ]),
    ];

    await logic.initialize({ sources, constants }, []);

    const col: number[] = [1];
    const context = new Array<number[]>(16).fill(col, 0, 256);
    await logic["runContext(uint256[][])"](context);
    const resultCol_ = await logic.stack();
    assert(resultCol_, "should read context value at 0xff00");
  });

  it("should support context width [ROW] up to 256", async () => {
    const MAX_ROWS = 2 ** 8;
    const constants = [MAX_ROWS - 1];
    const sources = [
      concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.CONTEXT_ROW, 0), // context[0][0]
      ]),
    ];

    await logic.initialize({ sources, constants }, [1]);

    const row: number[] = new Array<number>(MAX_ROWS).fill(1, 0, MAX_ROWS);
    const context = [row];
    await logic["runContext(uint256[][])"](context);
    const resultRow_ = await logic.stack();
    assert(resultRow_, "should read context value at 0x00ff");
  });

  it("should error if accessing memory outside of context memory range", async () => {
    const constants = [10];
    const sources = [
      concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.CONTEXT_ROW, 0), // context[0][10]
      ]),
    ];

    await logic.initialize({ sources, constants }, [1]);

    // OOB check for row is being made at runtime
    await assertError(
      async () => await logic["runContext(uint256[][])"]([[]]),
      "Array accessed at an out-of-bounds or negative index",
      "did not error when accessing OOB ROW"
    );
  });

  it("should error if accessing OOB COLUMN", async () => {
    const constants = [];
    const sources = [concat([op(Opcode.CONTEXT_ROW, 0x0100)])];

    await assertError(
      async () => await logic.initialize({ sources, constants }, [1]),
      "OOB_COLUMN",
      "did not error when accessing OOB COLUMN"
    );
    // OOB ROW is checked at runtime
  });

  it("should return correct context value when specifying CONTEXT_ROW operand for 2D context", async () => {
    const constants = [0, 1, 2, 3];
    const sources = [
      concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.CONTEXT_ROW, 0), // context[0][0]
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.CONTEXT_ROW, 0), // context[0][1]
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
        op(Opcode.CONTEXT_ROW, 0), // context[0][2]
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
        op(Opcode.CONTEXT_ROW, 0), // context[0][3]
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.CONTEXT_ROW, 1), // context[1][0]
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.CONTEXT_ROW, 1), // context[1][1]
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
        op(Opcode.CONTEXT_ROW, 1), // context[1][2]
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
        op(Opcode.CONTEXT_ROW, 1), // context[1][3]
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.CONTEXT_ROW, 2), // context[2][0]
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.CONTEXT_ROW, 2), // context[2][1]
      ]),
    ];

    await logic.initialize({ sources, constants }, [10]);

    const context = [
      [0, 1, 2, 3],
      [4, 5, 6, 7],
      [8, 9],
    ];

    await logic["runContext(uint256[][])"](context);

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

  it("should return correct context value when specifying CONTEXT_ROW operand for 1D context", async () => {
    const constants = [0, 1, 2, 3];
    const sources = [
      concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.CONTEXT_ROW, 0), // context[0][0]
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.CONTEXT_ROW, 0), // context[0][1]
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)),
        op(Opcode.CONTEXT_ROW, 0), // context[0][2]
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)),
        op(Opcode.CONTEXT_ROW, 0), // context[0][3]
      ]),
    ];

    await logic.initialize({ sources, constants }, [3]);

    const context = [[10, 20, 30, 40]];

    await logic["runContext(uint256[][])"](context);

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

  it("should support adding new data to stack at runtime via CONTEXT_ROW opcode", async () => {
    const constants = [0];
    const sources = [
      concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.CONTEXT_ROW, 1), // context[1][0]
      ]),
    ];

    await logic.initialize({ sources, constants }, [1]);

    const data = [
      [422, 213, 123, 413],
      [11, 22],
    ];

    await logic["runContext(uint256[][])"](data);

    const result = await logic.stackTop();
    const expected = 11;

    assert(
      result.eq(expected),
      `wrong value was returned
      expected  ${expected}
      got       ${result}`
    );
  });
});
