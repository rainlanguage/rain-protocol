import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { max_uint256 } from "../../../../utils/constants";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../../utils/test/assertError";

const Opcode = AllStandardOps;

// For SaturatingMath library tests, see the associated test file at test/Math/SaturatingMath.sol.ts
describe("RainInterpreter MathOps saturating math", async () => {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;

  before(async () => {
    rainInterpreter = await rainterpreterDeploy();

    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
  });

  it("should perform saturating multiplication", async () => {
    const constants = [max_uint256, 2];
    const vMaxUInt256 = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const v2 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));

    // test case with normal multiplication
    // prettier-ignore
    const sourcesUnsat = [
      concat([
        // (max_uint256 2 *)
          vMaxUInt256,
          v2,
        op(Opcode.MUL, 2),
      ]),
    ];

    const expression0 = await expressionConsumerDeploy(
      {
        sources: sourcesUnsat,
        constants,
      },
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic.eval(rainInterpreter.address, expression0.dispatch, []),
      "Error",
      "normal multiplication overflow did not error"
    );

    // prettier-ignore
    const sourcesSat = [
      concat([
        // (max_uint256 2 SAT_MUL)
          vMaxUInt256,
          v2,
        op(Opcode.SATURATING_MUL, 2),
      ]),
    ];

    const expression1 = await expressionConsumerDeploy(
      {
        sources: sourcesSat,
        constants,
      },
      rainInterpreter,
      1
    );

    await logic.eval(rainInterpreter.address, expression1.dispatch, []);
    const result = await logic.stackTop();
    const expected = max_uint256;
    assert(
      result.eq(expected),
      `wrong saturating multiplication ${expected} ${result}`
    );
  });

  it("should perform saturating subtraction", async () => {
    const constants = [10, 20];
    const v10 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
    const v20 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));

    // test case with normal subtraction
    // prettier-ignore
    const sourcesUnsat = [
      concat([
        // (10 20 -)
          v10,
          v20,
        op(Opcode.SUB, 2),
      ]),
    ];

    const expression0 = await expressionConsumerDeploy(
      {
        sources: sourcesUnsat,
        constants,
      },
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic.eval(rainInterpreter.address, expression0.dispatch, []),
      "Error",
      "normal subtraction overflow did not error"
    );

    // prettier-ignore
    const sourcesSat = [
      concat([
        // (10 20 SAT_SUB)
          v10,
          v20,
        op(Opcode.SATURATING_SUB, 2),
      ]),
    ];

    const expression1 = await expressionConsumerDeploy(
      {
        sources: sourcesSat,
        constants,
      },
      rainInterpreter,
      1
    );

    await logic.eval(rainInterpreter.address, expression1.dispatch, []);
    const result = await logic.stackTop();
    const expected = 0;
    assert(
      result.eq(expected),
      `wrong saturating subtraction ${expected} ${result}`
    );
  });

  it("should perform saturating addition", async () => {
    const constants = [max_uint256, 10];
    const vMaxUInt256 = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const v10 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));

    // test case with normal addition
    // prettier-ignore
    const sourcesUnsat = [
      concat([
        // (max_uint256 10 +)
          vMaxUInt256,
          v10,
        op(Opcode.ADD, 2),
      ]),
    ];

    const expression0 = await expressionConsumerDeploy(
      {
        sources: sourcesUnsat,
        constants,
      },
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic.eval(rainInterpreter.address, expression0.dispatch, []),
      "Error",
      "normal addition overflow did not error"
    );

    // prettier-ignore
    const sourcesSat = [
      concat([
        // (max_uint256 1 SAT_ADD)
          vMaxUInt256,
          v10,
        op(Opcode.SATURATING_ADD, 2),
      ]),
    ];

    const expression1 = await expressionConsumerDeploy(
      {
        sources: sourcesSat,
        constants,
      },
      rainInterpreter,
      1
    );

    await logic.eval(rainInterpreter.address, expression1.dispatch, []);
    const result = await logic.stackTop();
    const expected = max_uint256;
    assert(
      result.eq(expected),
      `wrong saturating addition ${expected} ${result}`
    );
  });
});
