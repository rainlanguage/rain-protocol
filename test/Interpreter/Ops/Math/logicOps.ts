import { assert } from "chai";
import type { BigNumber } from "ethers";
import { hexZeroPad } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { standardEvaluableConfig } from "../../../../utils";

const isTruthy = (interpreterValue: BigNumber) => !interpreterValue.isZero();

describe("RainInterpreter logic ops", async function () {
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

  it("should check whether any value in a list is non-zero", async () => {
    const { sources: sources0, constants: constants0 } =
      standardEvaluableConfig(`_: any(1 2 3);`);

    const expression0 = await expressionConsumerDeploy(
      sources0,
      constants0,
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

    const { sources: sources1, constants: constants1 } =
      standardEvaluableConfig(`_: any(0 0);`);

    const expression1 = await expressionConsumerDeploy(
      sources1,
      constants1,
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

    const { sources: sources2, constants: constants2 } =
      standardEvaluableConfig(`_: any(0 0 3);`);

    const expression2 = await expressionConsumerDeploy(
      sources2,
      constants2,
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
    const { sources: sources0, constants: constants0 } = standardEvaluableConfig(
      `_: every(1 2 3);`
    );

    const expression0 = await expressionConsumerDeploy(
      sources0,
      constants0,
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

    const { sources: sources1, constants: constants1 } =
      standardEvaluableConfig(`_: every(0 1 2);`);

    const expression1 = await expressionConsumerDeploy(
      sources1,
      constants1,
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

    const { sources: sources2, constants: constants2 } =
      standardEvaluableConfig(`_: every(0 3);`);

    const expression2 = await expressionConsumerDeploy(
      sources2,
      constants2,
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
    const { sources: sources0, constants: constants0 } =
      standardEvaluableConfig(`_: eager-if(1 2 3);`);

    const expression0 = await expressionConsumerDeploy(
      sources0,
      constants0,
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

    const { sources: sources1, constants: constants1 } =
      standardEvaluableConfig(`_: eager-if(2 2 3);`);

    const expression1 = await expressionConsumerDeploy(
      sources1,
      constants1,
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

    const { sources: sources2, constants: constants2 } =
      standardEvaluableConfig(`_: eager-if(0 2 3);`);

    const expression2 = await expressionConsumerDeploy(
      sources2,
      constants2,
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
    const { sources: sources0, constants: constants0 } =
      standardEvaluableConfig(`_: greater-than(2 1);`);

    const expression0 = await expressionConsumerDeploy(
      sources0,
      constants0,
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

    const { sources: sources1, constants: constants1 } =
      standardEvaluableConfig(`_: greater-than(1 2);`);

    const expression1 = await expressionConsumerDeploy(
      sources1,
      constants1,
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
    const { sources: sources0, constants: constants0 } =
      standardEvaluableConfig(`_: less-than(2 1);`);

    const expression0 = await expressionConsumerDeploy(
      sources0,
      constants0,
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

    const { sources: sources1, constants: constants1 } =
      standardEvaluableConfig(`_: less-than(1 2);`);

    const expression1 = await expressionConsumerDeploy(
      sources1,
      constants1,
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

    const { sources: sources0, constants: constants0 } =
      standardEvaluableConfig(`_: equal-to(2 2);`);

    const expression0 = await expressionConsumerDeploy(
      sources0,
      constants0,
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

    const { sources: sources1, constants: constants1 } =
      standardEvaluableConfig(`_: equal-to(1 2);`);

    const expression1 = await expressionConsumerDeploy(
      sources1,
      constants1,
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

    const { sources: sources2, constants: constants2 } =
      standardEvaluableConfig(`_: equal-to(1 context<0 0>());`);

    const expression2 = await expressionConsumerDeploy(
      sources2,
      constants2,
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

    const { sources: sources3, constants: constants3 } =
      standardEvaluableConfig(`_: equal-to(${id} context<0 0>());`);

    const expression3 = await expressionConsumerDeploy(
      sources3,
      constants3,
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
    const { sources: sources0, constants: constants0 } =
      standardEvaluableConfig(`_: is-zero(0);`);

    const expression0 = await expressionConsumerDeploy(
      sources0,
      constants0,
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

    const { sources: sources1, constants: constants1 } =
      standardEvaluableConfig(`_: is-zero(1);`);

    const expression1 = await expressionConsumerDeploy(
      sources1,
      constants1,
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
