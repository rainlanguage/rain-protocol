import { ethers } from "hardhat";
import { Parser } from "rainlang";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { getRainterpreterOpMetaBytes } from "../../../../utils";
import { max_uint256 } from "../../../../utils/constants";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { assertError } from "../../../../utils/test/assertError";

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
    const expressionString = `_: exp(${max_uint256.div(2)} 2);`;

    const stateConfig = Parser.getStateConfig(
      expressionString,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig,
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic["eval(address,uint256,uint256[][])"](
          rainInterpreter.address,
          expression0.dispatch,
          []
        ),
      "Error",
      "accumulator overflow did not panic"
    );
  });

  it("should panic when accumulator overflows with multiplication op", async () => {
    const expressionString = `_: mul(${max_uint256.div(2)} 3);`;

    const stateConfig = Parser.getStateConfig(
      expressionString,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig,
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic["eval(address,uint256,uint256[][])"](
          rainInterpreter.address,
          expression0.dispatch,
          []
        ),
      "Error",
      "accumulator overflow did not panic"
    );
  });

  it("should panic when accumulator underflows with subtraction op", async () => {
    const expressionString = `_: sub(0 1);`;

    const stateConfig = Parser.getStateConfig(
      expressionString,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig,
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic["eval(address,uint256,uint256[][])"](
          rainInterpreter.address,
          expression0.dispatch,
          []
        ),
      "Error",
      "accumulator underflow did not panic"
    );
  });

  it("should panic when accumulator overflows with addition op", async () => {
    const expressionString = `_: add(${max_uint256} 1);`;

    const stateConfig = Parser.getStateConfig(
      expressionString,
      getRainterpreterOpMetaBytes()
    );

    const expression0 = await expressionConsumerDeploy(
      stateConfig,
      rainInterpreter,
      1
    );

    await assertError(
      async () =>
        await logic["eval(address,uint256,uint256[][])"](
          rainInterpreter.address,
          expression0.dispatch,
          []
        ),
      "Error",
      "accumulator overflow did not panic"
    );
  });
});
