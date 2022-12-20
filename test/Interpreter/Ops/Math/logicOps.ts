import { assert } from "chai";
import type { BigNumber } from "ethers";
import { concat, hexZeroPad } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import {
  AllStandardOps,
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { expressionDeployConsumer } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

const Opcode = AllStandardOps;

const isTruthy = (interpreterValue: BigNumber) => !interpreterValue.isZero();

describe("RainInterpreter logic ops", async function () {
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

  it("should check whether any value in a list is non-zero", async () => {
    const constants = [0, 1, 2, 3];

    const v0 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
    const v1 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));
    const v2 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));
    const v3 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const source0 = concat([
        v1,
        v2,
        v3,
      op(Opcode.ANY, 3),
    ]);

    const expression0 = await expressionDeployConsumer(
      {
        sources: [source0],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression0.dispatch, []);
    const result0 = await logic.stackTop();

    assert(result0.eq(1), `returned wrong value from any, got ${result0}`);

    // prettier-ignore
    const source1 = concat([
        v0,
        v0,
      op(Opcode.ANY, 2),
    ]);

    const expression1 = await expressionDeployConsumer(
      {
        sources: [source1],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression1.dispatch, []);
    const result1 = await logic.stackTop();

    assert(result1.isZero(), `returned wrong value from any, got ${result1}`);

    // prettier-ignore
    const source2 = concat([
        v0,
        v0,
        v3,
      op(Opcode.ANY, 3),
    ]);

    const expression2 = await expressionDeployConsumer(
      {
        sources: [source2],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression2.dispatch, []);
    const result2 = await logic.stackTop();

    assert(result2.eq(3), `returned wrong value from any, got ${result2}`);
  });

  it("should check whether every value in a list is non-zero", async () => {
    const constants = [0, 1, 2, 3];

    const v0 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
    const v1 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));
    const v2 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));
    const v3 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const source0 = concat([
        v1,
        v2,
        v3,
      op(Opcode.EVERY, 3),
    ]);

    const expression0 = await expressionDeployConsumer(
      {
        sources: [source0],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression0.dispatch, []);
    const result0 = await logic.stackTop();

    assert(result0.eq(1), `returned wrong value from every, got ${result0}`);

    // prettier-ignore
    const source1 = concat([
        v0,
        v1,
        v2,
      op(Opcode.EVERY, 3),
    ]);

    const expression1 = await expressionDeployConsumer(
      {
        sources: [source1],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression1.dispatch, []);
    const result1 = await logic.stackTop();

    assert(result1.isZero(), `returned wrong value from every, got ${result1}`);

    // prettier-ignore
    const source2 = concat([
        v0,
        v3,
      op(Opcode.EVERY, 2),
    ]);

    const expression2 = await expressionDeployConsumer(
      {
        sources: [source2],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression2.dispatch, []);
    const result2 = await logic.stackTop();

    assert(result2.isZero(), `returned wrong value from every, got ${result2}`);
  });

  it("should perform ternary 'eager if' operation on 3 values on the stack", async () => {
    const constants = [0, 1, 2, 3];

    const v0 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0));
    const v1 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));
    const v2 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));
    const v3 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const source0 = concat([
      // 1 ? 2 : 3
        v1,
        v2,
        v3,
      op(Opcode.EAGER_IF),
    ]);

    const expression0 = await expressionDeployConsumer(
      {
        sources: [source0],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression0.dispatch, []);
    const result0 = await logic.stackTop();

    assert(result0.eq(2), `returned wrong value from eager if, got ${result0}`);

    // prettier-ignore
    const source1 = concat([
      // 2 ? 2 : 3
        v2,
        v2,
        v3,
      op(Opcode.EAGER_IF),
    ]);

    const expression1 = await expressionDeployConsumer(
      {
        sources: [source1],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression1.dispatch, []);
    const result1 = await logic.stackTop();

    assert(result1.eq(2), `returned wrong value from eager if, got ${result1}`);

    // prettier-ignore
    const source2 = concat([
      // 0 ? 2 : 3
        v0,
        v2,
        v3,
      op(Opcode.EAGER_IF),
    ]);

    const expression2 = await expressionDeployConsumer(
      {
        sources: [source2],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression2.dispatch, []);
    const result2 = await logic.stackTop();

    assert(result2.eq(3), `returned wrong value from eager if, got ${result2}`);
  });

  it("should check that value is greater than another value", async () => {
    const constants = [1, 2];

    // prettier-ignore
    const source0 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // 2
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // 1
      op(Opcode.GREATER_THAN),
    ]);

    const expression0 = await expressionDeployConsumer(
      {
        sources: [source0],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression0.dispatch, []);
    const result0 = await logic.stackTop(); // expect 1

    assert(isTruthy(result0), "wrongly says 2 is not gt 1");

    // prettier-ignore
    const source1 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // 1
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // 2
      op(Opcode.GREATER_THAN),
    ]);

    const expression1 = await expressionDeployConsumer(
      {
        sources: [source1],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression1.dispatch, []);
    const result1 = await logic.stackTop(); // expect 0

    assert(!isTruthy(result1), "wrongly says 1 is gt 2");
  });

  it("should check that value is less than another value", async () => {
    const constants = [1, 2];

    // prettier-ignore
    const source0 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // 2
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // 1
      op(Opcode.LESS_THAN),
    ]);

    const expression0 = await expressionDeployConsumer(
      {
        sources: [source0],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression0.dispatch, []);
    const result0 = await logic.stackTop(); // expect 0

    assert(!isTruthy(result0), "wrongly says 2 is lt 1");

    // prettier-ignore
    const source1 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // 1
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // 2
      op(Opcode.LESS_THAN),
    ]);

    const expression1 = await expressionDeployConsumer(
      {
        sources: [source1],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression1.dispatch, []);
    const result1 = await logic.stackTop(); // expect 1

    assert(isTruthy(result1), "wrongly says 1 is not lt 2");
  });

  it("should check that values are equal to each other", async () => {
    const id = hexZeroPad(ethers.utils.randomBytes(32), 32);

    const constants = [1, 2, 2, id];

    // prettier-ignore
    const source0 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // 2
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2)), // also 2
      op(Opcode.EQUAL_TO),
    ]);

    const expression0 = await expressionDeployConsumer(
      {
        sources: [source0],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression0.dispatch, []);
    const result0 = await logic.stackTop(); // expect 1

    assert(isTruthy(result0), "wrongly says 2 is not equal to 2");

    // prettier-ignore
    const source1 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // 1
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)), // 2
      op(Opcode.EQUAL_TO),
    ]);

    const expression1 = await expressionDeployConsumer(
      {
        sources: [source1],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression1.dispatch, []);
    const result1 = await logic.stackTop(); // expect 0

    assert(!isTruthy(result1), "wrongly says 1 is equal to 2");

    // prettier-ignore
    const source2 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)), // 1
      op(Opcode.CONTEXT, 0x0000), // 1
      op(Opcode.EQUAL_TO),
    ]);

    const expression2 = await expressionDeployConsumer(
      {
        sources: [source2],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression2.dispatch, [[1]]);
    const result2 = await logic.stackTop(); // expect 1

    assert(
      isTruthy(result2),
      "wrongly says constant 1 is not equal to context 1"
    );

    // prettier-ignore
    const source3 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 3)), // id
      op(Opcode.CONTEXT, 0x0000), // id
      op(Opcode.EQUAL_TO),
    ]);

    const expression3 = await expressionDeployConsumer(
      {
        sources: [source3],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression3.dispatch, [[id]]);
    const result3 = await logic.stackTop(); // expect 1

    assert(
      isTruthy(result3),
      "wrongly says id as constant is not equal to id as context"
    );
  });

  it("should check that a value is zero", async () => {
    const constants = [0, 1];

    // prettier-ignore
    const source0 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.ISZERO),
    ]);

    const expression0 = await expressionDeployConsumer(
      {
        sources: [source0],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression0.dispatch, []);

    const result0 = await logic.stackTop(); // expect 1

    assert(isTruthy(result0), "wrongly says 0 is not zero");

    // prettier-ignore
    const source1 = concat([
      op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.ISZERO),
    ]);

    const expression1 = await expressionDeployConsumer(
      {
        sources: [source1],
        constants,
      },
      rainInterpreter
    );
    await logic.eval(rainInterpreter.address, expression1.dispatch, []);

    const result1 = await logic.stackTop(); // expect 0

    assert(!isTruthy(result1), "wrongly says 1 is zero");
  });
});
