import { assert } from "chai";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { standardEvaluableConfig } from "../../../../utils";

describe("RainInterpreter prb Ops tests", async function () {
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

  it("should calculate the arithmetic average of x and y, rounding down", async () => {
    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(`_: prb-avg(0 3e6);`);

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

    assert(result0.eq(1.5e6), `returned wrong value, got ${result0}`);

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(`
        avg: prb-avg(200e18 400e18);
        `);

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

    assert(
      result1.eq("300000000000000000000"),
      `returned wrong value, got ${result1}`
    );

    const { sources: sources2, constants: constants2 } =
      await standardEvaluableConfig(`
        avg: prb-avg(1e24 1e25);
      `);

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

    assert(
      result2.eq("5500000000000000000000000"),
      `returned wrong value, got ${result2}`
    );
  });

  it("should yield the smallest whole UD60x18 number greater than or equal to x", async () => {
    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(`output: prb-ceil(0);`);

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

    assert(result0.eq(0), `returned wrong value, got ${result0}`);

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(`
        output: prb-ceil(3141592653589793000);
        `);

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

    assert(
      result1.eq("4000000000000000000"),
      `returned wrong value, got ${result1}`
    );

    const { sources: sources2, constants: constants2 } =
      await standardEvaluableConfig(`
        output: prb-ceil(1125000000000000000);
      `);

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

    assert(
      result2.eq("2000000000000000000"),
      `returned wrong value, got ${result2}`
    );
  });

  it("should divide two UD60x18 numbers, returning a new UD60x18 number. Rounds towards zero.", async () => {
    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(`output: prb-div(0 3141592653589793000);`);

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

    assert(result0.eq(0), `returned wrong value, got ${result0}`);

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(`
        output: prb-div(1000000000000000000000000 1000000000000000000);
        `);

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

    assert(
      result1.eq("1000000000000000000000000"),
      `returned wrong value, got ${result1}`
    );

    const { sources: sources2, constants: constants2 } =
      await standardEvaluableConfig(`
        output: prb-div(22000000000000000000 7000000000000000000);
      `);

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

    assert(
      result2.eq("3142857142857142857"),
      `returned wrong value, got ${result2}`
    );

    const { sources: sources3, constants: constants3 } =
      await standardEvaluableConfig(`
        output: prb-div(50000000000000000 20000000000000000);
      `);

    const expression3 = await expressionConsumerDeploy(
      sources3,
      constants3,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression3.dispatch,
      []
    );
    const result3 = await logic.stackTop();

    assert(
      result3.eq("2500000000000000000"),
      `returned wrong value, got ${result3}`
    );
  });

  it("should calculate the natural exponent of x", async () => {
    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(`output: prb-exp(14984651468134608);`);

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

    assert(
      result0.eq("1015097484240068000"),
      `returned wrong value, got ${result0}`
    );

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(`
        output: prb-exp(2000000000000000000);
        `);

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

    assert(
      result1.eq("7389056098930650223"),
      `returned wrong value, got ${result1}`
    );

    const { sources: sources2, constants: constants2 } =
      await standardEvaluableConfig(`
        output: prb-exp(1000);
      `);

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

    assert(
      result2.eq("1000000000000000999"),
      `returned wrong value, got ${result2}`
    );

    const { sources: sources3, constants: constants3 } =
      await standardEvaluableConfig(`
        output: prb-exp(0);
      `);

    const expression3 = await expressionConsumerDeploy(
      sources3,
      constants3,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression3.dispatch,
      []
    );
    const result3 = await logic.stackTop();

    assert(
      result3.eq("1000000000000000000"),
      `returned wrong value, got ${result3}`
    );
  });

  it("should calculates the binary exponent of x using the binary fraction method", async () => {
    // https://ethereum.stackexchange.com/questions/79903/exponential-function-with-fractional-numbers

    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(`output: prb-exp2(14984651468134608);`);

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

    assert(
      result0.eq("1010440696561597790"),
      `returned wrong value, got ${result0}`
    );

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(`
        output: prb-exp2(2000000000000000000);
        `);

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

    assert(
      result1.eq("4000000000000000000"),
      `returned wrong value, got ${result1}`
    );

    const { sources: sources2, constants: constants2 } =
      await standardEvaluableConfig(`
        output: prb-exp2(11892150000000000000);
      `);

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

    assert(
      result2.eq("3800964933301542754377"),
      `returned wrong value, got ${result2}`
    );

    const { sources: sources3, constants: constants3 } =
      await standardEvaluableConfig(`
        output: prb-exp2(0);
      `);

    const expression3 = await expressionConsumerDeploy(
      sources3,
      constants3,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression3.dispatch,
      []
    );
    const result3 = await logic.stackTop();

    assert(
      result3.eq("1000000000000000000"),
      `returned wrong value, got ${result3}`
    );
  });

  it("should yeild the greatest whole UD60x18 number less than or equal to x", async () => {
    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(`output: prb-floor(0);`);

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

    assert(result0.eq(0), `returned wrong value, got ${result0}`);

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(`
        output: prb-floor(3141592653589793000);
        `);

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

    assert(
      result1.eq("3000000000000000000"),
      `returned wrong value, got ${result1}`
    );

    const { sources: sources2, constants: constants2 } =
      await standardEvaluableConfig(`
        output: prb-floor(1125000000000000000);
      `);

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

    assert(
      result2.eq("1000000000000000000"),
      `returned wrong value, got ${result2}`
    );
  });

  it("should yield the excess beyond the floor of x", async () => {
    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(`output: prb-frac(0);`);

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

    assert(result0.eq(0), `returned wrong value, got ${result0}`);

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(`
        output: prb-frac(3141592653589793000);
        `);

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

    assert(
      result1.eq("141592653589793000"),
      `returned wrong value, got ${result1}`
    );

    const { sources: sources2, constants: constants2 } =
      await standardEvaluableConfig(`
        output: prb-frac(max-uint256);
      `);

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

    assert(
      result2.eq("584007913129639935"),
      `returned wrong value, got ${result2}`
    );
  });

  it("should calculate the geometric mean of x and y, i.e. $$sqrt(x * y)$$, rounding down", async () => {
    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(`output: prb-gm(0 3141592653589793000);`);

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

    assert(result0.eq(0), `returned wrong value, got ${result0}`);

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(`
        output: prb-gm(2000000000000000000 8000000000000000000);
        `);

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

    assert(
      result1.eq("4000000000000000000"),
      `returned wrong value, got ${result1}`
    );

    const { sources: sources2, constants: constants2 } =
      await standardEvaluableConfig(`
        output: prb-gm(3141592653589793000 8200000000000000000);
      `);

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

    assert(
      result2.eq("5075535416036056249"),
      `returned wrong value, got ${result2}`
    );

    const { sources: sources3, constants: constants3 } =
      await standardEvaluableConfig(`
        output: prb-gm(2404800000000000000000 7899210662000000000000);
      `);

    const expression3 = await expressionConsumerDeploy(
      sources3,
      constants3,
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression3.dispatch,
      []
    );
    const result3 = await logic.stackTop();

    assert(
      result3.eq("4358442588812843362311"),
      `returned wrong value, got ${result3}`
    );
  });

  it("should calculate 1 / x, rounding toward zero", async () => {
    const { sources: sources0, constants: constants0 } =
      await standardEvaluableConfig(`output: prb-inv(1);`);

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

    assert(
      result0.eq("1000000000000000000000000000000000000"),
      `returned wrong value, got ${result0}`
    );

    const { sources: sources1, constants: constants1 } =
      await standardEvaluableConfig(`
        output: prb-inv(3141592653589793000);
        `);

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

    assert(
      result1.eq("318309886183790695"),
      `returned wrong value, got ${result1}`
    );

    const { sources: sources2, constants: constants2 } =
      await standardEvaluableConfig(`
        output: prb-inv(max-uint256);
      `);

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

    assert(result2.eq("0"), `returned wrong value, got ${result2}`);
  });
});
