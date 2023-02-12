import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { createEmptyBlock } from "../../../../utils/hardhat";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../../utils/interpreter/ops/allStandardOps";

const Opcode = AllStandardOps;

describe("RainInterpreter MathOps standard math", async () => {
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

  it("should perform a calculation using the block number as a value", async () => {
    const constants = [1, 2, 3, 4, 6];

    const one = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const two = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const three = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));
    const four = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 3));
    const six = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 4));

    // prettier-ignore
    const sources = [
      concat([
        // (BLOCK_NUMBER (6 3 /) (3 4 (2 1 -) +) *)
          op(Opcode.blockNumber),
            six,
            three,
          op(Opcode.div, 2),
            three,
            four,
              two,
              one,
            op(Opcode.sub, 2),
          op(Opcode.add, 3),
        op(Opcode.mul, 3),
      ]),
    ];

    const expression0 = await expressionConsumerDeploy(
      
        sources,
        constants
      ,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const block0 = await ethers.provider.getBlockNumber();
    const result0 = await logic.stackTop();
    const expected0 = 16 * block0;
    assert(
      result0.eq(expected0),
      `wrong solution with block number of ${block0}
      expected  ${expected0}
      got       ${result0}`
    );

    await createEmptyBlock();

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const block1 = await ethers.provider.getBlockNumber();

    const result1 = await logic.stackTop();
    const expected1 = 16 * block1;
    assert(
      result1.eq(expected1),
      `wrong solution with block number of ${block1 + 1}
      expected  ${expected1}
      got       ${result1}`
    );

    await createEmptyBlock();

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const block2 = await ethers.provider.getBlockNumber();
    const result2 = await logic.stackTop();
    const expected2 = 16 * block2;
    assert(
      result2.eq(expected2),
      `wrong solution with block number of ${block2}
      expected  ${expected2}
      got       ${result2}`
    );
  });

  it("should return correct remainder when using modulo op on sequence of numbers", async () => {
    const constants = [7, 4, 2];
    const v7 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const v4 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const v2 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const sources = [
      concat([
        // (7 4 2 %)
          v7,
          v4, // -> r3
          v2, // -> r1
        op(Opcode.mod, 3),
      ]),
    ];

    const expression0 = await expressionConsumerDeploy(
      
        sources,
        constants
      ,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expected = 1;
    assert(
      result.eq(expected),
      `wrong solution to (7 4 2 %)
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should return correct remainder when using modulo op (zero rem)", async () => {
    const constants = [9, 3];
    const v9 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const v3 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const sources = [
      concat([
        // (9 3 %)
          v9,
          v3,
        op(Opcode.mod, 2),
      ]),
    ];

    const expression0 = await expressionConsumerDeploy(
      
        sources,
        constants
      ,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expected = 0;
    assert(
      result.eq(expected),
      `wrong solution to (9 3 %)
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should return correct remainder when using modulo op (non-zero rem)", async () => {
    const constants = [5, 2];
    const v5 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const v2 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const sources = [
      concat([
        // (5 2 %)
          v5,
          v2,
        op(Opcode.mod, 2),
      ]),
    ];

    const expression0 = await expressionConsumerDeploy(
      
        sources,
        constants
      ,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expected = 1;
    assert(
      result.eq(expected),
      `wrong solution to (5 2 %)
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should perform exponentiation on a sequence of numbers", async () => {
    const constants = [2, 4, 3];
    const v2 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const v4 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const v3 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const sources = [
      concat([
        // (2 4 3 ^)
          v2,
          v4,
          v3,
        op(Opcode.exp, 3),
      ]),
    ];

    const expression0 = await expressionConsumerDeploy(
      
        sources,
        constants
      ,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expected = 4096;
    assert(
      result.eq(expected),
      `wrong solution to (2 4 3 ^)
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should perform exponentiation correctly", async () => {
    const constants = [2, 4];
    const v2 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const v4 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const sources = [
      concat([
        // (2 4 ^)
          v2,
          v4,
        op(Opcode.exp, 2),
      ]),
    ];

    const expression0 = await expressionConsumerDeploy(
      
        sources,
        constants
      ,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expected = 16;
    assert(
      result.eq(expected),
      `wrong solution to (2 4 ^)
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should return the maximum of a sequence of numbers", async () => {
    const constants = [33, 11, 22];
    const v33 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const v11 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const v22 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const source = concat([
      // (22 11 33 max)
        v22,
        v11,
        v33,
      op(Opcode.max, 3),
    ]);

    const expression0 = await expressionConsumerDeploy(
      
         [source],
        constants,
      
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expected = 33;
    assert(result.eq(expected), `wrong maximum ${expected} ${result}`);
  });

  it("should return the minimum of a sequence of numbers", async () => {
    const constants = [33, 11, 22];
    const v33 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const v11 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const v22 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const source = concat([
      // (22 11 33 min)
        v22,
        v11,
        v33,
      op(Opcode.min, 3),
    ]);

    const expression0 = await expressionConsumerDeploy(
      
         [source],
        constants,
      
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expected = 11;
    assert(result.eq(expected), `wrong minimum ${expected} ${result}`);
  });

  it("should calculate a mathematical expression (division, product, summation)", async () => {
    const constants = [2, 3];
    const v2 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const v3 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const sources = [
      concat([
        // (((2 2 2 +) 3 *) 2 3 /)
              v2,
              v2,
              v2,
            op(Opcode.add, 3),
            v3,
          op(Opcode.mul, 2),
          v2,
          v3,
        op(Opcode.div, 3),
      ]),
    ];

    const expression0 = await expressionConsumerDeploy(
      
        sources,
        constants
      ,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expected = 3;
    assert(
      result.eq(expected),
      `wrong solution to (((2 2 2 +) 3 *) 2 3 /)
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should return remainder of dividing an initial number by the product of a sequence of numbers", async () => {
    const constants = [3, 2, 13];
    const v3 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const v2 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const v13 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const sources = [
      concat([
        // (13 2 3 %)
          v13,
          v2,
          v3,
        op(Opcode.mod, 3),
      ]),
    ];

    const expression0 = await expressionConsumerDeploy(
      
        sources,
        constants
      ,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expected = 1;
    assert(
      result.eq(expected),
      `wrong remainder
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should divide an initial number by the product of a sequence of numbers", async () => {
    const constants = [3, 2, 12];
    const v3 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const v2 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const v12 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const sources = [
      concat([
        // (12 2 3 /)
          v12,
          v2,
          v3,
        op(Opcode.div, 3),
      ]),
    ];

    const expression0 = await expressionConsumerDeploy(
      
        sources,
        constants
      ,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expected = 2;
    assert(
      result.eq(expected),
      `wrong division
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should multiply a sequence of numbers together", async () => {
    const constants = [5, 4, 3];
    const v5 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const v4 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const v3 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const sources = [
      concat([
        // (3 4 5 *)
          v3,
          v4,
          v5,
        op(Opcode.mul, 3),
      ]),
    ];

    const expression0 = await expressionConsumerDeploy(
      
        sources,
        constants
      ,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expected = 60;
    assert(
      result.eq(expected),
      `wrong multiplication
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should subtract a sequence of numbers from an initial number", async () => {
    const constants = [3, 2, 10];
    const v3 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const v2 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const v10 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const sources = [
      concat([
        // (10 2 3 -)
          v10,
          v2,
          v3,
        op(Opcode.sub, 3),
      ]),
    ];

    const expression0 = await expressionConsumerDeploy(
      
        sources,
        constants
      ,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expected = 5;
    assert(
      result.eq(expected),
      `wrong subtraction
      expected  ${expected}
      got       ${result}`
    );
  });

  it("should add a sequence of numbers together", async () => {
    const constants = [3, 2, 1];
    const v3 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const v2 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const v1 = op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const sources = [
      concat([
        // (1 2 3 +)
          v1,
          v2,
          v3,
        op(Opcode.add, 3),
      ]),
    ];

    const expression0 = await expressionConsumerDeploy(
      
        sources,
        constants
      ,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result = await logic.stackTop();
    const expected = 6;
    assert(result.eq(expected), `wrong summation ${expected} ${result}`);
  });
});
