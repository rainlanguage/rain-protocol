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

describe("RainInterpreter unchecked math", async () => {
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

  it("should panic when accumulator overflows with exponentiation op", async () => {
    const constants = [max_uint256.div(2), 2];

    const vHalfMaxUInt256 = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vTwo = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const source0 = concat([
        vHalfMaxUInt256,
        vTwo,
      op(Opcode.EXP, 2)
    ]);

    const expression0 = await expressionConsumerDeploy(
      {
        sources: [source0],
        constants,
      },
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic.eval(rainInterpreter.address, expression0.dispatch, []),
      "Error",
      "accumulator overflow did not panic"
    );
  });

  it("should panic when accumulator overflows with multiplication op", async () => {
    const constants = [max_uint256.div(2), 3];

    const vHalfMaxUInt256 = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vThree = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );

    // prettier-ignore
    const source0 = concat([
        vHalfMaxUInt256,
        vThree,
      op(Opcode.MUL, 2)
    ]);

    const expression0 = await expressionConsumerDeploy(
      {
        sources: [source0],
        constants,
      },
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic.eval(rainInterpreter.address, expression0.dispatch, []),
      "Error",
      "accumulator overflow did not panic"
    );
  });

  it("should panic when accumulator underflows with subtraction op", async () => {
    const constants = [0, 1];

    const vZero = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
    const vOne = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const source0 = concat([
        vZero,
        vOne,
      op(Opcode.SUB, 2)
    ]);

    const expression0 = await expressionConsumerDeploy(
      {
        sources: [source0],
        constants,
      },
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic.eval(rainInterpreter.address, expression0.dispatch, []),
      "Error",
      "accumulator underflow did not panic"
    );
  });

  it("should panic when accumulator overflows with addition op", async () => {
    const constants = [max_uint256, 1];

    const vMaxUInt256 = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vOne = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));

    // prettier-ignore
    const source0 = concat([
        vMaxUInt256,
        vOne,
      op(Opcode.ADD, 2)
    ]);

    const expression0 = await expressionConsumerDeploy(
      {
        sources: [source0],
        constants,
      },
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic.eval(rainInterpreter.address, expression0.dispatch, []),
      "Error",
      "accumulator overflow did not panic"
    );
  });
});
