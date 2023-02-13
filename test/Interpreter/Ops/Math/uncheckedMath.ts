import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { standardEvaluableConfig } from "../../../../utils";
import { max_uint256 } from "../../../../utils/constants";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { assertError } from "../../../../utils/test/assertError";

describe("RainInterpreter unchecked math", async () => {
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

  it("should panic when accumulator overflows with exponentiation op", async () => {
    const { sources, constants } = standardEvaluableConfig(
      `_: exp(${max_uint256.div(2)} 2);`
    );
    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
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
    const { sources, constants } = standardEvaluableConfig(
      `_: mul(${max_uint256.div(2)} 3);`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
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
    const { sources, constants } = standardEvaluableConfig(`_: sub(0 1);`);

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
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
    const { sources, constants } = standardEvaluableConfig(
      `_: add(${max_uint256} 1);`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
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
