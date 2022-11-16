import type {
  AggregatorV3Interface,
  AllStandardOpsTest,
} from "../../../../typechain";
import {
  AllStandardOps,
  assertError,
  eighteenZeros,
  getBlockTimestamp,
  memoryOperand,
  MemoryType,
  op,
  sixZeros,
  timewarp,
} from "../../../../utils";
import { allStandardOpsDeploy } from "../../../../utils/deploy/test/allStandardOps/deploy";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { concat } from "ethers/lib/utils";
import { assert } from "chai";

const Opcode = AllStandardOps;

describe("CHAINLINK_PRICE Opcode tests", async function () {
  let logic: AllStandardOpsTest;
  let fakeChainlinkOracle: FakeContract<AggregatorV3Interface>;

  beforeEach(async () => {
    fakeChainlinkOracle = await smock.fake("AggregatorV3Interface");
  });

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it("should revert if price is stale", async () => {
    const chainlinkPriceData = {
      roundId: 1,
      answer: 123 + eighteenZeros,
      startedAt: 2,
      updatedAt: 1800, // 1800 sec into the future
      answeredInRound: 4,
    };

    fakeChainlinkOracle.latestRoundData.returns(chainlinkPriceData);
    fakeChainlinkOracle.decimals.returns(18);

    const feed = fakeChainlinkOracle.address;
    const staleAfter = (await getBlockTimestamp()) + 3600;

    const sources = [
      concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.CHAINLINK_PRICE),
      ]),
    ];
    const constants = [feed, staleAfter];

    await logic.initialize(
      {
        sources,
        constants,
      },
      [1]
    );

    await timewarp(1900); // updated 100 sec ago

    await logic.run();

    await timewarp(3600); // updated 3700 sec ago (stale)

    await assertError(
      async () => await logic.run(),
      "STALE_PRICE",
      "did not revert when chainlink price was stale"
    );
  });

  it("should revert if price is 0", async () => {
    const chainlinkPriceData = {
      roundId: 1,
      answer: 0 + eighteenZeros,
      startedAt: 2,
      updatedAt: 3,
      answeredInRound: 4,
    };

    fakeChainlinkOracle.latestRoundData.returns(chainlinkPriceData);
    fakeChainlinkOracle.decimals.returns(18);

    const feed = fakeChainlinkOracle.address;
    const staleAfter = (await getBlockTimestamp()) + 10000;

    const sources = [
      concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.CHAINLINK_PRICE),
      ]),
    ];
    const constants = [feed, staleAfter];

    await logic.initialize(
      {
        sources,
        constants,
      },
      [1]
    );

    await assertError(
      async () => await logic.run(),
      "MIN_BASE_PRICE",
      "did not revert when chainlink price was 0"
    );
  });

  it("should correctly scale answer from 6 decimal to 18 decimal FP", async () => {
    const chainlinkPriceData = {
      roundId: 1,
      answer: 123 + sixZeros,
      startedAt: 2,
      updatedAt: 3,
      answeredInRound: 4,
    };

    fakeChainlinkOracle.latestRoundData.returns(chainlinkPriceData);
    fakeChainlinkOracle.decimals.returns(6);

    const feed = fakeChainlinkOracle.address;
    const staleAfter = (await getBlockTimestamp()) + 10000;

    const sources = [
      concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.CHAINLINK_PRICE),
      ]),
    ];
    const constants = [feed, staleAfter];

    await logic.initialize(
      {
        sources,
        constants,
      },
      [1]
    );

    await logic.run();
    const price_ = await logic.stackTop();

    assert(price_.eq(123 + eighteenZeros));
  });

  it("should get price from chainlink oracle", async () => {
    const chainlinkPriceData = {
      roundId: 1,
      answer: 123 + eighteenZeros,
      startedAt: 2,
      updatedAt: 3,
      answeredInRound: 4,
    };

    fakeChainlinkOracle.latestRoundData.returns(chainlinkPriceData);
    fakeChainlinkOracle.decimals.returns(18);

    const feed = fakeChainlinkOracle.address;
    const staleAfter = (await getBlockTimestamp()) + 10000;

    const sources = [
      concat([
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 0)),
        op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1)),
        op(Opcode.CHAINLINK_PRICE),
      ]),
    ];
    const constants = [feed, staleAfter];

    await logic.initialize(
      {
        sources,
        constants,
      },
      [1]
    );

    await logic.run();
    const price_ = await logic.stackTop();

    assert(price_.eq(123 + eighteenZeros));
  });
});
