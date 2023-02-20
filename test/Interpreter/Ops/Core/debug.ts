import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { iinterpreterV1ConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import {
  callOperand,
  Debug,
  doWhileOperand,
  loopNOperand,
  memoryOperand,
  MemoryType,
  op,
  standardEvaluableConfig,
} from "../../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../../utils/interpreter/ops/allStandardOps";

const Opcode = AllStandardOps;

describe("RainInterpreter debug op", async function () {
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
  });

  it("should log stack when DEBUG operand is set to DEBUG_STACK", async () => {
    const { sources, constants } = standardEvaluableConfig(
      `_: add(10 20),
      : debug<${Debug.Stack}>();`
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 1);

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );

    assert(true); // you have to check this log yourself
  });

  it("should log packed state when DEBUG operand is set to DEBUG_STATE_PACKED", async () => {
    const { sources, constants } = standardEvaluableConfig(
      `_: add(10 20),
      : debug<${Debug.StatePacked}>();`
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 1);

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );

    assert(true); // you have to check this log yourself
  });

  it("should be able to log when used within a source from CALL op", async () => {
    const constants = [0, 1, 20];

    const { sources } = standardEvaluableConfig(
      `
      a: read-memory<1 0>(),
      b: read-memory<1 1>(),
      _: call<1 1>(b),
      : debug<${Debug.StatePacked}>();

      : debug<${Debug.StatePacked}>(),
      c: read-memory<0 0>(),
      d: read-memory<1 2>(),
      : debug<${Debug.StatePacked}>(),
      _: less-than(c d);`
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 1);

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );
  });

  it("should be able to log when used within a source from DO_WHILE op", async () => {
    const constants = [3, 2, 7];

    // prettier-ignore
    const sourceMAIN = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
          op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)),
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)),
        op(Opcode.less_than),
      op(Opcode.do_while, doWhileOperand(1, 0, 1)), // Source to run is on index 1
    ]);

    // prettier-ignore
    const sourceWHILE = concat([
        op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)),
      op(Opcode.add, 2),
        op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 1)),
        op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2)),
      op(Opcode.less_than),
      op(Opcode.debug, Debug.StatePacked),
    ]);

    const { sources } = standardEvaluableConfig(
      `
      a: read-memory<1 0>(),
      c: read-memory<0 0>(),
      b: read-memory<1 2>(),
      condition: less-than(c b),
      _: do-while<1>(a condition);

      : debug<${Debug.StatePacked}>(),
      c: read-memory<0 0>(),
      d: read-memory<1 1>(),
      _: add(c d),
      c: read-memory<0 1>(),
      d: read-memory<1 2>(),
      _: less-than(c d),
      : debug<${Debug.StatePacked}>();`
    );
    // const { sources } = standardEvaluableConfig(
    //   `
    //   a: 11,
    //   c: 11,
    //   b: 11,
    //   _: less-than(c b);
    // `
    // );

    // [sourceMAIN, sourceWHILE],
    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(
        sources,
        constants,

        1
      );

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );
  });

  it("should be able to log when used within a source from LOOP_N op", async () => {
    const n = 5;
    const initialValue = 2;
    const incrementValue = 1;

    const constants = [initialValue, incrementValue];

    // prettier-ignore
    const sourceADD = concat([
          op(Opcode.read_memory, memoryOperand(MemoryType.Stack, 0)),
          op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.add, 2),
        op(Opcode.debug, Debug.Stack),
      ]);

    // prettier-ignore
    const sourceMAIN = concat([
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0)),
      op(Opcode.loop_n, loopNOperand(n, 1, 1, 1))
    ]);

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(
        [sourceMAIN, sourceADD],
        constants,

        1
      );

    let expectedResult = initialValue;
    for (let i = 0; i < n; i++) {
      expectedResult += incrementValue;
    }

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );
    const result0 = await consumerLogic.stackTop();
    assert(
      result0.eq(expectedResult),
      `Invalid output, expected ${expectedResult}, actual ${result0}`
    );
  });
});
