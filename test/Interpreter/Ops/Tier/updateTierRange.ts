import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { createEmptyBlock } from "../../../../utils/hardhat";
import { standardEvaluableConfig } from "../../../../utils/interpreter/interpreter";
import { assertError } from "../../../../utils/test/assertError";
import { NEVER } from "../../../../utils/tier";
import { Tier } from "../../../../utils/types/tier";

describe("RainInterpreter update tier range op", async function () {
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

  it("should enforce maxTier for update tier range operation", async () => {
    await createEmptyBlock(3);

    const block = await ethers.provider.getBlockNumber();

    const startTier = Tier.ZERO;
    const endTier = 9; // beyond max tier of Tier.EIGHT

    const { sources, constants } = standardEvaluableConfig(
      `update-timestamp: ${NEVER},
      report: ${block},
      _: update-times-for-tier-range<${startTier} ${endTier}>(update-timestamp report);`
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
      "MAX_TIER",
      "did not trigger MAX_TIER. Either MAX_TIER check is broken, or endTier silently saturates to 8 despite user input of endTier=9"
    );
  });
});
