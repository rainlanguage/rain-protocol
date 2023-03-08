import { assert } from "chai";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { assertError } from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import {
  MemoryType,
  standardEvaluableConfig,
} from "../../../../utils/interpreter/interpreter";

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
    const sourceIndex = 1;
    const column = 0;
    const width = 4;

    const { sources, constants } = await standardEvaluableConfig(
      `
      /* 
        sources[0] 
      */
      _: fold-context<${width} ${column} ${sourceIndex}>(0);

      /* 
        sources[1] 
      */
      a b c d e: ,
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

    const { sources } = await standardEvaluableConfig(
      `
      /* 
        sources[0] 
      */
      _: fold-context<${width} ${column} ${sourceIndex}>(read-memory<0 ${MemoryType.Constant}>());

      /* 
        sources[1] 
      */
      acc a1 a2 a3 a4: ,
      a: equal-to(a1 read-memory<1 ${MemoryType.Constant}>()),
      b: equal-to(a2 read-memory<1 ${MemoryType.Constant}>()),
      c: equal-to(a3 read-memory<1 ${MemoryType.Constant}>()),
      d: equal-to(a4 read-memory<1 ${MemoryType.Constant}>()),
      _: add(acc a b c d),
      `
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
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

    const { sources } = await standardEvaluableConfig(
      `
      /* 
        sources[0] 
      */
      _: fold-context<${width} ${column} ${sourceIndex}>(read-memory<0 ${MemoryType.Constant}>());

      /* 
        sources[1] 
      */
      s0 s1 s2 s3 s4: ,
      _: add(s0 s1 s2 s3 s4),
      `
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
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

    const { sources } = await standardEvaluableConfig(
      `
      /* 
        sources[0] 
      */
      _: fold-context<${width} ${column} ${sourceIndex}>(read-memory<0 ${MemoryType.Constant}>());

      /* 
        sources[1] 
      */
      s0: ,
      `
    );
    const expression0 = await expressionConsumerDeploy(
      sources,
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

    const { sources } = await standardEvaluableConfig(
      `
      /* 
        sources[0] 
      */
      _: fold-context<${width} ${column} ${sourceIndex}>(read-memory<0 ${MemoryType.Constant}>());

      /* 
        sources[1] 
      */
      s0 s1 s2 s3 s4: ,
      _: add(s0 s1 s2 s3 s4);
      `
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
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

    const constants = [0, 2, width];

    const { sources } = await standardEvaluableConfig(
      `
      /* 
        sourceMain
      */
      _ _: fold-context<${width} ${column} ${sourceIndex}>(read-memory<0 ${MemoryType.Constant}>() read-memory<0 ${MemoryType.Constant}>());

      /* 
        sourceCalculate
      */
       
      evencount oddcount s2 s3 s4 s5: ,
      retevencount: call<2 1>(s2 s3 s4 s5),

      /* counting ODD numbers [Total elements - EVEN number count = ODD number count] */
      totalminuseven: sub(read-memory<2 ${MemoryType.Constant}>() retevencount),
      retoddcount: add(totalminuseven oddcount),
      _: add(retevencount evencount),
      _: retoddcount;


      /* 
      sourceCountEvent
      */
      s0 s1 s2 s3: ,
      a: is-zero(mod(s0 read-memory<1 ${MemoryType.Constant}>())),
      b: is-zero(mod(s1 read-memory<1 ${MemoryType.Constant}>())),
      c: is-zero(mod(s2 read-memory<1 ${MemoryType.Constant}>())),
      d: is-zero(mod(s3 read-memory<1 ${MemoryType.Constant}>())),
      _: add(a b c d);
      `
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
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
