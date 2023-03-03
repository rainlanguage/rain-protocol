import { assert } from "chai";
import { ethers } from "hardhat";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { iinterpreterV1ConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import {
  Debug,
  MemoryType,
  standardEvaluableConfig,
} from "../../../../utils/interpreter/interpreter";

describe("RainInterpreter debug op", async function () {
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
  });

  it("should log stack when DEBUG operand is set to DEBUG_STACK", async () => {
    const { sources, constants } = await standardEvaluableConfig(
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
    const { sources, constants } = await standardEvaluableConfig(
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

    const { sources } = await standardEvaluableConfig(
      `
      a: read-memory<0 ${MemoryType.Constant}>(),
      b: read-memory<1 ${MemoryType.Constant}>(),
      _: call<1 1>(b),
      : debug<${Debug.StatePacked}>();
      
      : debug<${Debug.StatePacked}>(),
      c: read-memory<0 ${MemoryType.Stack}>(),
      d: read-memory<2 ${MemoryType.Constant}>(),
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

    const { sources } = await standardEvaluableConfig(
      `
      /* Main Source */
      input: read-memory<0 ${MemoryType.Constant}>(),
      condition: less-than(
        read-memory<0 ${MemoryType.Stack}>()
        read-memory<2 ${MemoryType.Constant}>()
      ),

      _: do-while<1>(
        input
        condition
      );

      /* do-while source */ 
      : debug<${Debug.StatePacked}>(),
      _: add(
          read-memory<0 ${MemoryType.Stack}>() 
          read-memory<1 ${MemoryType.Constant}>()
        ),

      _: less-than( 
        read-memory<1 ${MemoryType.Stack}>() 
        read-memory<2 ${MemoryType.Constant}>()
      ),
      : debug<${Debug.StatePacked}>();`
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 1);

    await consumerLogic["eval(address,uint256,uint256[][])"](
      interpreter.address,
      dispatch,
      []
    );
  });

  it("should be able to log when used within a source from LOOP_N op", async () => {
    const loopSize = 5;
    const initialValue = 2;
    const incrementValue = 1;

    const constants = [initialValue, incrementValue];
    const { sources } = await standardEvaluableConfig(
      `
      /* MAIN SOURCE */
      input: read-memory<0 ${MemoryType.Constant}>(),
      _: loop-n<${loopSize} 1 1>(input);
      
      /* loop-n source */
      _: add(
          read-memory<0 ${MemoryType.Stack}>() 
          read-memory<1 ${MemoryType.Constant}>()
        ),
      : debug<${Debug.StatePacked}>();`
    );

    const { consumerLogic, interpreter, dispatch } =
      await iinterpreterV1ConsumerDeploy(sources, constants, 1);

    let expectedResult = initialValue;
    for (let i = 0; i < loopSize; i++) {
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
