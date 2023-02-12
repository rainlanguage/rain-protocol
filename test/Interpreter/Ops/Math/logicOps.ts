import { assert } from "chai";
import type { BigNumber } from "ethers";
import { hexZeroPad } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { Parser } from "rainlang";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { getRainterpreterOpMetaBytes } from "../../../../utils";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";

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
    // prettier-ignore
    const expressionString0 = `_: any(1 2 3);`;

    const stateConfig0 = Parser.getStateConfig(
      expressionString0,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig0,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result0 = await logic.stackTop();

    assert(result0.eq(1), `returned wrong value from any, got ${result0}`);

    // prettier-ignore
    const expressionString1 = `_: any(0 0);`;

    const stateConfig1 = Parser.getStateConfig(
      expressionString1,
      getRainterpreterOpMetaBytes()
    );

    const expression1 = await expressionConsumerDeploy(
      stateConfig1,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression1.dispatch,
      []
    );
    const result1 = await logic.stackTop();

    assert(result1.isZero(), `returned wrong value from any, got ${result1}`);

    // prettier-ignore
    const expressionString2 = `_: any(0 0 3);`;

    const stateConfig2 = Parser.getStateConfig(
      expressionString2,
      getRainterpreterOpMetaBytes()
    );

    const expression2 = await expressionConsumerDeploy(
      stateConfig2,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression2.dispatch,
      []
    );
    const result2 = await logic.stackTop();

    assert(result2.eq(3), `returned wrong value from any, got ${result2}`);
  });

  it("should check whether every value in a list is non-zero", async () => {
    // prettier-ignore
    const expressionString0 = `_: every(1 2 3);`;

    const stateConfig0 = Parser.getStateConfig(
      expressionString0,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig0,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result0 = await logic.stackTop();

    assert(result0.eq(1), `returned wrong value from every, got ${result0}`);

    // prettier-ignore
    const expressionString1 = `_: every(0 1 2);`;

    const stateConfig1 = Parser.getStateConfig(
      expressionString1,
      getRainterpreterOpMetaBytes()
    );

    const expression1 = await expressionConsumerDeploy(
      stateConfig1,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression1.dispatch,
      []
    );
    const result1 = await logic.stackTop();

    assert(result1.isZero(), `returned wrong value from every, got ${result1}`);

    // prettier-ignore
    const expressionString2 = `_: every(0 3);`;

    const stateConfig2 = Parser.getStateConfig(
      expressionString2,
      getRainterpreterOpMetaBytes()
    );

    const expression2 = await expressionConsumerDeploy(
      stateConfig2,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression2.dispatch,
      []
    );
    const result2 = await logic.stackTop();

    assert(result2.isZero(), `returned wrong value from every, got ${result2}`);
  });

  it("should perform ternary 'eager if' operation on 3 values on the stack", async () => {
    // prettier-ignore
    const expressionString0 = `_: eager-if(1 2 3);`;

    const stateConfig0 = Parser.getStateConfig(
      expressionString0,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig0,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result0 = await logic.stackTop();

    assert(result0.eq(2), `returned wrong value from eager if, got ${result0}`);

    // prettier-ignore
    const expressionString1 = `_: eager-if(2 2 3);`;

    const stateConfig1 = Parser.getStateConfig(
      expressionString1,
      getRainterpreterOpMetaBytes()
    );

    const expression1 = await expressionConsumerDeploy(
      stateConfig1,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression1.dispatch,
      []
    );
    const result1 = await logic.stackTop();

    assert(result1.eq(2), `returned wrong value from eager if, got ${result1}`);

    // prettier-ignore
    const expressionString2 = `_: eager-if(0 2 3);`;

    const stateConfig2 = Parser.getStateConfig(
      expressionString2,
      getRainterpreterOpMetaBytes()
    );

    const expression2 = await expressionConsumerDeploy(
      stateConfig2,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression2.dispatch,
      []
    );
    const result2 = await logic.stackTop();

    assert(result2.eq(3), `returned wrong value from eager if, got ${result2}`);
  });

  it("should check that value is greater than another value", async () => {
    // prettier-ignore
    const expressionString0 = `_: greater-than(2 1);`;

    const stateConfig0 = Parser.getStateConfig(
      expressionString0,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig0,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result0 = await logic.stackTop(); // expect 1

    assert(isTruthy(result0), "wrongly says 2 is not gt 1");

    // prettier-ignore
    const expressionString1 = `_: greater-than(1 2);`;

    const stateConfig1 = Parser.getStateConfig(
      expressionString1,
      getRainterpreterOpMetaBytes()
    );

    const expression1 = await expressionConsumerDeploy(
      stateConfig1,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression1.dispatch,
      []
    );
    const result1 = await logic.stackTop(); // expect 0

    assert(!isTruthy(result1), "wrongly says 1 is gt 2");
  });

  it("should check that value is less than another value", async () => {
    // prettier-ignore
    const expressionString0 = `_: less-than(2 1);`;

    const stateConfig0 = Parser.getStateConfig(
      expressionString0,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig0,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result0 = await logic.stackTop(); // expect 0

    assert(!isTruthy(result0), "wrongly says 2 is lt 1");

    // prettier-ignore
    const expressionString1 = `_: less-than(1 2);`;

    const stateConfig1 = Parser.getStateConfig(
      expressionString1,
      getRainterpreterOpMetaBytes()
    );

    const expression1 = await expressionConsumerDeploy(
      stateConfig1,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression1.dispatch,
      []
    );
    const result1 = await logic.stackTop(); // expect 1

    assert(isTruthy(result1), "wrongly says 1 is not lt 2");
  });

  it("should check that values are equal to each other", async () => {
    const id = hexZeroPad(ethers.utils.randomBytes(32), 32);

    const constants = [1, 2, 2, id];

    const expressionString0 = `_: equal-to(2 2);`;

    const stateConfig0 = Parser.getStateConfig(
      expressionString0,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig0,
      rainInterpreter,
      1
    );

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result0 = await logic.stackTop(); // expect 1

    assert(isTruthy(result0), "wrongly says 2 is not equal to 2");

    const expressionString1 = `_: equal-to(1 2);`;

    const stateConfig1 = Parser.getStateConfig(
      expressionString1,
      getRainterpreterOpMetaBytes()
    );

    const expression1 = await expressionConsumerDeploy(
      stateConfig1,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression1.dispatch,
      []
    );
    const result1 = await logic.stackTop(); // expect 0

    assert(!isTruthy(result1), "wrongly says 1 is equal to 2");

    const expressionString2 = `_: equal-to(1 context<0 0>());`;

    const stateConfig2 = Parser.getStateConfig(
      expressionString2,
      getRainterpreterOpMetaBytes()
    );

    const expression2 = await expressionConsumerDeploy(
      stateConfig2,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression2.dispatch,
      [[1]]
    );
    const result2 = await logic.stackTop(); // expect 1

    assert(
      isTruthy(result2),
      "wrongly says constant 1 is not equal to context 1"
    );

    const expressionString3 = `_: equal-to(${id} context<0 0>());`;

    const stateConfig3 = Parser.getStateConfig(
      expressionString3,
      getRainterpreterOpMetaBytes()
    );

    const expression3 = await expressionConsumerDeploy(
      stateConfig3,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression3.dispatch,
      [[id]]
    );
    const result3 = await logic.stackTop(); // expect 1

    assert(
      isTruthy(result3),
      "wrongly says id as constant is not equal to id as context"
    );
  });

  it("should check that a value is zero", async () => {
    const constants = [0, 1];

    const expressionString0 = `_: is-zero(0);`;

    const stateConfig0 = Parser.getStateConfig(
      expressionString0,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig0,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );

    const result0 = await logic.stackTop(); // expect 1

    assert(isTruthy(result0), "wrongly says 0 is not zero");

    const expressionString1 = `_: is-zero(1);`;

    const stateConfig1 = Parser.getStateConfig(
      expressionString1,
      getRainterpreterOpMetaBytes()
    );

    const expression1 = await expressionConsumerDeploy(
      stateConfig1,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression1.dispatch,
      []
    );

    const result1 = await logic.stackTop(); // expect 0

    assert(!isTruthy(result1), "wrongly says 1 is zero");
  });
});
