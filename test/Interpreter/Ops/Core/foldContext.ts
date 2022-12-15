import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import type { AllStandardOpsTest } from "../../../../typechain";
import { assertError } from "../../../../utils";
import { allStandardOpsDeploy } from "../../../../utils/deploy/test/allStandardOps/deploy";
import {
  callOperand,
  Debug,
  foldContextOperand,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../../utils/interpreter/ops/allStandardOps";

const Opcode = AllStandardOps;

describe("RainInterpreter FOLD_CONTEXT", async function () {
  let logic: AllStandardOpsTest;

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it("should add all the elements in the context", async () => {
    const constants = [0];
    const sourceIndex = 1;
    const column = 0;
    const width = 4;
    const inputSize = 1; // Accummulator size
    // prettier-ignore
    const sourceMain = concat([
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // acc
        op(Opcode.FOLD_CONTEXT, foldContextOperand(sourceIndex, column, width, inputSize)),      
    ]);

    const sourceAdd = concat([op(Opcode.ADD, width + inputSize)]);

    await logic.initialize(
      {
        sources: [sourceMain, sourceAdd],
        constants,
      },
      [1]
    );

    const context = [
      [10, 20, 30, 40],
      [100, 200, 300, 400],
      [1000, 2000, 3000, 4000],
      [5, 6, 7, 8],
    ];

    await logic["runContext(uint256[][])"](context);
    const result = await logic.stackTop();
    const expectedResult = context.flat().reduce((acc, val) => acc + val);
    assert(
      result.eq(expectedResult),
      `Invalid value calculated using FOLD_CONTEXT, expected ${expectedResult} actual ${result}`
    );
  });

  it("should count the occurences of X in the context", async () => {
    const X = 10;
    const constants = [0, X];
    const sourceIndex = 1;
    const column = 0;
    const width = 4;
    const inputSize = 1; // Accummulator size
    // prettier-ignore
    const sourceMain = concat([
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // acc
        op(Opcode.FOLD_CONTEXT, foldContextOperand(sourceIndex, column, width, inputSize)),      
    ]);

    // prettier-ignore
    const sourceCount = concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 0)), // acc

          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 1)), // context[0][]
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // X
        op(Opcode.EQUAL_TO),

          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 2)), // context[1][]
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // X
        op(Opcode.EQUAL_TO),

          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 3)), // context[2][]
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // X
        op(Opcode.EQUAL_TO),

          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 4)), // context[3][]
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // X
        op(Opcode.EQUAL_TO),

      op(Opcode.ADD, 5),
    ]);

    await logic.initialize(
      {
        sources: [sourceMain, sourceCount],
        constants,
      },
      [1]
    );

    const context = [
      [10, 20, 30, 40],
      [100, 10, 300, 400],
      [10, 2000, 10, 4000],
      [5, 6, 10, 10],
    ];

    await logic["runContext(uint256[][])"](context);
    const result = await logic.stackTop();
    let count = 0;
    const expectedResult = context.flat().reduce((acc, val) => {
      if (acc == X) count++;
      if (val == X) count++;
      return count;
    });

    assert(
      result.eq(expectedResult),
      `Invalid value calculated using FOLD_CONTEXT, expected ${expectedResult} actual ${result}`
    );
  });

  it("should throw error if adjacent columns are shorter than the main starting column", async () => {
    const constants = [0];
    const sourceIndex = 1;
    const column = 0; // Starting Column
    const width = 4;
    const inputSize = 1; // Accummulator size
    // prettier-ignore
    const sourceMain = concat([
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // acc
        op(Opcode.FOLD_CONTEXT, foldContextOperand(sourceIndex, column, width, inputSize)),      
    ]);

    const sourceAdd = concat([op(Opcode.ADD, width + inputSize)]);

    await logic.initialize(
      {
        sources: [sourceMain, sourceAdd],
        constants,
      },
      [1]
    );

    const context = [
      [10, 20, 30, 40], // Starting Column
      [100, 200, 300], // Shorter column width than starting column
      [1000, 2000, 3000, 4000],
      [5, 6, 7, 8],
    ];

    await assertError(
      async () => await logic["runContext(uint256[][])"](context),
      "Array accessed at an out-of-bounds or negative index",
      "did not error when the column being accessed is shorter than the starting column"
    );
  });

  it("should loop over 0 length columns", async () => {
    const constants = [0];
    const sourceIndex = 1;
    const column = 0; // Starting Column
    const width = 0;
    const inputSize = 1; // Accummulator size
    // prettier-ignore
    const sourceMain = concat([
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // acc
        op(Opcode.FOLD_CONTEXT, foldContextOperand(sourceIndex, column, width, inputSize)),      
    ]);

    const sourceAdd = concat([op(Opcode.ADD, width + inputSize)]);

    await logic.initialize(
      {
        sources: [sourceMain, sourceAdd],
        constants,
      },
      [1]
    );

    const context = [[]];

    await logic["runContext(uint256[][])"](context);
    const result = await logic.stackTop();
    const expectedResult = constants[0]; // Since only accumultor value will be present on the stack
    assert(
      result.eq(expectedResult),
      `Invalid value calculated using FOLD_CONTEXT, expected ${expectedResult} actual ${result}`
    );
  });

  it("should loop over dynamic length columns", async () => {
    const constants = [0];
    const sourceIndex = 1;
    const column = 0; // Starting Column
    const width = 4;
    const inputSize = 1; // Accummulator size
    // prettier-ignore
    const sourceMain = concat([
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // acc
        op(Opcode.FOLD_CONTEXT, foldContextOperand(sourceIndex, column, width, inputSize)),      
    ]);

    const sourceAdd = concat([op(Opcode.ADD, width + inputSize)]);

    await logic.initialize(
      {
        sources: [sourceMain, sourceAdd],
        constants,
      },
      [1]
    );

    const context1 = [
      [10, 20, 30, 40],
      [100, 200, 300, 400],
      [1000, 2000, 3000, 4000],
      [5, 6, 7, 8],
    ];

    await logic["runContext(uint256[][])"](context1);
    const result1 = await logic.stackTop();
    const expectedResult1 = context1.flat().reduce((acc, val) => acc + val);
    assert(
      result1.eq(expectedResult1),
      `Invalid value calculated using FOLD_CONTEXT, expected ${expectedResult1} actual ${result1}`
    );

    // Changing context length
    const context2 = [
      [10, 20, 30, 40, 134, 54, 123, 234],
      [100, 200, 300, 400, 134, 54, 12, 234],
      [1000, 2000, 3000, 4000, 10, 20, 30, 40],
      [5, 6, 7, 8, 6, 7, 8, 8],
    ];

    await logic["runContext(uint256[][])"](context2);
    const result2 = await logic.stackTop();
    const expectedResult2 = context2.flat().reduce((acc, val) => acc + val);
    assert(
      result2.eq(expectedResult2),
      `Invalid value calculated using FOLD_CONTEXT, expected ${expectedResult2} actual ${result2}`
    );

    // Changing context length
    // prettier-ignore
    const context3 = [
      [10], 
      [100], 
      [112300], 
      [134]
    ];

    await logic["runContext(uint256[][])"](context3);
    const result3 = await logic.stackTop();
    const expectedResult3 = context3.flat().reduce((acc, val) => acc + val);
    assert(
      result3.eq(expectedResult3),
      `Invalid value calculated using FOLD_CONTEXT, expected ${expectedResult3} actual ${result3}`
    );
  });

  it("should reduce over accumulators correctly with inputs that are modified inplace iteratively then returned as outputs", async () => {
    // This test calculates the number of odd and even numbers in the context

    const sourceIndex = 1;
    const column = 0;
    const width = 4;
    const inputSize = 2; // Accummulator size

    const constants = [0, 2, width];
    // prettier-ignore
    const sourceMain = concat([
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // even count acc
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // odd count acc
        op(Opcode.FOLD_CONTEXT, foldContextOperand(sourceIndex, column, width, inputSize)),      
    ]);

    // prettier-ignore
    const sourceCalculate = concat([
        // counting EVEN numbers
        op(Opcode.CALL, callOperand(width, 1, 2)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 2)), // Duplicating the returned value from call [i.e EVEN count]
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 0)), 
      op(Opcode.ADD, 2),
      
          // counting ODD numbers [Total elements - EVEN number count = ODD number count]
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // Total width 
          op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 2)), // number of even numbers in this context iteration
        op(Opcode.SUB, 2),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 1)), 
      op(Opcode.ADD, 2),
      op(Opcode.DEBUG, Debug.StatePacked)
    ]);

    // prettier-ignore
    const sourceCountEven = concat([
      // since the width is predetermined and is static, we can read fixed number of values from the stack
        // (contextVal % 2) == 0 ? 
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 0)), 
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), 
          op(Opcode.MOD, 2),
        op(Opcode.ISZERO),
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 1)), 
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), 
          op(Opcode.MOD, 2),
        op(Opcode.ISZERO),
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 2)), 
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), 
          op(Opcode.MOD, 2),
        op(Opcode.ISZERO),
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Stack, 3)), 
            op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), 
          op(Opcode.MOD, 2),
        op(Opcode.ISZERO),
      op(Opcode.ADD, 4), // Adding all the mod values
    ]);

    await logic.initialize(
      {
        sources: [sourceMain, sourceCalculate, sourceCountEven],
        constants,
      },
      [1]
    );

    const context = [
      [11, 21, 31, 41],
      [100, 207, 300, 400],
      [1000, 2000, 3007, 4000],
      [5, 6, 7, 8],
    ];

    await logic["runContext(uint256[][])"](context);
    const [evenCount, oddCount] = await logic.stack();

    let expectedOddCount = 0,
      expectedEvenCount = 0;

    for (const val of context.flat()) {
      if (val % 2) expectedOddCount++;
      else expectedEvenCount++;
    }

    assert(
      evenCount.eq(expectedEvenCount),
      `Invalid value calculated using FOLD_CONTEXT, expected ${expectedEvenCount} actual ${evenCount}`
    );

    assert(
      oddCount.eq(expectedOddCount),
      `Invalid value calculated using FOLD_CONTEXT, expected ${expectedOddCount} actual ${oddCount}`
    );
  });
});
