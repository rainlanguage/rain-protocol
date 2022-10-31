import type {
  AggregatorV3Interface,
  AllStandardOpsTest,
} from "../../../../typechain";
import { AllStandardOps, op } from "../../../../utils";
import { allStandardOpsDeploy } from "../../../../utils/deploy/test/allStandardOps/deploy";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { concat } from "ethers/lib/utils";

const Opcode = AllStandardOps;

describe("CHAINLINK_PRICE Opcode test", async function () {
  let logic: AllStandardOpsTest;
  let fakeChainlinkOracle: FakeContract<AggregatorV3Interface>;

  beforeEach(async () => {
    fakeChainlinkOracle = await smock.fake("AggregatorV3Interface");
  });

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it("should get price from chainlink oracle", async () => {
    fakeChainlinkOracle.latestRoundData.returns({
      roundId: 0,
      answer: 1,
      startedAt: 2,
      updatedAt: 3,
      answeredInRound: 4,
    });
    fakeChainlinkOracle.decimals.returns(18);

    const sources = [concat([op(Opcode.CHAINLINK_PRICE)])];
    const constants = [];

    await logic.initialize({
      sources,
      constants,
    });

    await logic.run();
    const price_ = await logic.stackTop();

    console.log({ price_ });
  });
});
