import { assert } from "chai";
import { ethers } from "hardhat";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { iinterpreterV1ConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import {
  Debug,
  MemoryType,
  standardEvaluableConfig,
} from "../../../../utils/interpreter/interpreter";
import { rainlang } from "../../../../utils/extensions/rainlang";

describe("RainInterpreter debug op", async function () {
  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);
  });

  it("should log stack when DEBUG operand is set to DEBUG_STACK", async () => {
    const { sources, constants } = await standardEvaluableConfig(
      rainlang`_: add(10 20),
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
      rainlang`_: add(10 20),
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
    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
      a: 0,
      b: 1,
      _: call<1 1>(b),
      : debug<${Debug.StatePacked}>();
      
      : debug<${Debug.StatePacked}>(),
      c: read-memory<0 ${MemoryType.Stack}>(),
      d: 20,
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
    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
      /* Main Source */
      input: 3,
      condition: less-than(
        read-memory<0 ${MemoryType.Stack}>()
        7
      ),

      _: do-while<1>(
        input
        condition
      );

      /* do-while source */ 
      : debug<${Debug.StatePacked}>(),
      _: add(
          read-memory<0 ${MemoryType.Stack}>() 
          2
        ),

      _: less-than( 
        read-memory<1 ${MemoryType.Stack}>() 
        7
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

    const { sources, constants } = await standardEvaluableConfig(
      rainlang`
      /* MAIN SOURCE */
      input: ${initialValue},
      _: loop-n<${loopSize} 1 1>(input);
      
      /* loop-n source */
      _: add(
          read-memory<0 ${MemoryType.Stack}>() 
          ${incrementValue}
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
