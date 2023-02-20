import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { assertError } from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import {
  callOperand,
  Debug,
  foldContextOperand,
  memoryOperand,
  MemoryType,
  op,
  standardEvaluableConfig,
} from "../../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../../utils/interpreter/ops/allStandardOps";

const Opcode = AllStandardOps;

describe("RainInterpreter FOLD_CONTEXT", async function () {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
  });

  it("should add all the elements in the context", async () => {
    // const constants = [0];
    const sourceIndex = 1;
    const column = 0;
    const width = 4;

    const { sources, constants } = standardEvaluableConfig(
      `
      /* 
        sources[0] 
      */
      _: fold-context<${width} ${column} ${sourceIndex}>(0);

      /* 
        sources[1] 
      */
      a: read-memory<${MemoryType.Stack} 0>(),
      b: read-memory<${MemoryType.Stack} 1>(),
      c: read-memory<${MemoryType.Stack} 2>(),
      d: read-memory<${MemoryType.Stack} 3>(),
      e: read-memory<${MemoryType.Stack} 4>(),
      _: add(a b c d e);`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
      rainInterpreter,
      1
    );

    const context = [
      [10, 20, 30, 40],
      [100, 200, 300, 400],
      [1000, 2000, 3000, 4000],
      [5, 6, 7, 8],
    ];

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      context
    );
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
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // acc
        op(Opcode.fold_context, foldContextOperand(sourceIndex, column, width, inputSize)),
    ]);

    // prettier-ignore
    const sourceCount = concat([
        op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)), // acc

          op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 1)), // context[0][]
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // X
        op(Opcode.equal_to),

          op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 2)), // context[1][]
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // X
        op(Opcode.equal_to),

          op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 3)), // context[2][]
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // X
        op(Opcode.equal_to),

          op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 4)), // context[3][]
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)), // X
        op(Opcode.equal_to),

      op(Opcode.add, 5),
    ]);

    const expression0 = await expressionConsumerDeploy(
      [sourceMain, sourceCount],
      constants,

      rainInterpreter,
      1
    );

    const context = [
      [10, 20, 30, 40],
      [100, 10, 300, 400],
      [10, 2000, 10, 4000],
      [5, 6, 10, 10],
    ];

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      context
    );
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
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // acc
      op(
        Opcode.fold_context,
        foldContextOperand(sourceIndex, column, width, inputSize)
      ),
    ]);

    const sourceAdd = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)),
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 1)),
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 2)),
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 3)),
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 4)),
      op(Opcode.add, width + inputSize),
    ]);

    const expression0 = await expressionConsumerDeploy(
      [sourceMain, sourceAdd],
      constants,
      rainInterpreter,
      1
    );

    const context = [
      [10, 20, 30, 40], // Starting Column
      [100, 200, 300], // Shorter column width than starting column
      [1000, 2000, 3000, 4000],
      [5, 6, 7, 8],
    ];

    await assertError(
      async () =>
        await logic["eval(address,uint256,uint256[][])"](
          rainInterpreter.address,
          expression0.dispatch,
          context
        ),
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
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // acc
      op(
        Opcode.fold_context,
        foldContextOperand(sourceIndex, column, width, inputSize)
      ),
    ]);

    const sourceAdd = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)),
      op(Opcode.add, width + inputSize),
    ]);

    const expression0 = await expressionConsumerDeploy(
      [sourceMain, sourceAdd],
      constants,
      rainInterpreter,
      1
    );

    // The context column does need to exist even if it is zero length so it is
    // still a 2 dimensional array here.
    const context = [[]];

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      context
    );
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
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // acc
      op(
        Opcode.fold_context,
        foldContextOperand(sourceIndex, column, width, inputSize)
      ),
    ]);

    const sourceAdd = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)),
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 1)),
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 2)),
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 3)),
      op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 4)),
      op(Opcode.add, width + inputSize),
    ]);

    const expression0 = await expressionConsumerDeploy(
      [sourceMain, sourceAdd],
      constants,
      rainInterpreter,
      1
    );

    const context1 = [
      [10, 20, 30, 40],
      [100, 200, 300, 400],
      [1000, 2000, 3000, 4000],
      [5, 6, 7, 8],
    ];

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      context1
    );
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

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      context2
    );
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

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      context3
    );
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
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // even count acc
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)), // odd count acc
      op(Opcode.fold_context, foldContextOperand(sourceIndex, column, width, inputSize)),
    ]);

    // prettier-ignore
    // even odd a b c d => even odd
    const sourceCalculate = concat([
        // counting EVEN numbers
        op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 2)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 3)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 4)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 5)),
      op(Opcode.call, callOperand(width, 1, 2)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 6)), // Duplicating the returned value from call [i.e EVEN count]
        op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)),
      op(Opcode.add, 2),
      op(Opcode.debug),

          // counting ODD numbers [Total elements - EVEN number count = ODD number count]
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)), // Total width
          op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 6)), // number of even numbers in this context iteration
        op(Opcode.sub, 2),
        op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 1)),
      op(Opcode.add, 2),
      op(Opcode.debug, Debug.StatePacked)
    ]);

    // prettier-ignore
    const sourceCountEven = concat([
      // since the width is predetermined and is static, we can read fixed number of values from the stack
        // (contextVal % 2) == 0 ?
            op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)),
            op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)),
          op(Opcode.mod, 2),
        op(Opcode.is_zero),
            op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 1)),
            op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)),
          op(Opcode.mod, 2),
        op(Opcode.is_zero),
            op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 2)),
            op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)),
          op(Opcode.mod, 2),
        op(Opcode.is_zero),
            op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 3)),
            op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)),
          op(Opcode.mod, 2),
        op(Opcode.is_zero),
      op(Opcode.add, 4), // Adding all the mod values
    ]);

    const expression0 = await expressionConsumerDeploy(
      [sourceMain, sourceCalculate, sourceCountEven],
      constants,

      rainInterpreter,
      2
    );

    const context = [
      [11, 21, 31, 41],
      [100, 207, 300, 400],
      [1000, 2000, 3007, 4000],
      [5, 6, 7, 8],
    ];

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      context
    );
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
