import type {
  RainterpreterExtern,
  Rainterpreter,
  IInterpreterV1Consumer,
} from "../../../../typechain";
import {
  AllStandardOps,
  assertError,
  eighteenZeros,
  externOperand,
  getBlockTimestamp,
  memoryOperand,
  MemoryType,
  op,
  sixZeros,
} from "../../../../utils";
import { smock } from "@defi-wonderland/smock";
import { concat } from "ethers/lib/utils";
import { assert } from "chai";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import {
  rainterpreterDeploy,
  rainterpreterExtern,
} from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { ethers } from "hardhat";

const Opcode = AllStandardOps;

describe("CHAINLINK_PRICE Opcode tests", async function () {
  let rainInterpreter: Rainterpreter;
  let logic: IInterpreterV1Consumer;
  let rainInterpreterExtern: RainterpreterExtern;

  beforeEach(async () => {
    rainInterpreter = await rainterpreterDeploy();
    rainInterpreterExtern = await rainterpreterExtern();
    const consumerFactory = await ethers.getContractFactory(
      "IInterpreterV1Consumer"
    );
    logic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
    await logic.deployed();
  });

  it("extern op should revert if price is 0", async () => {
    const fakeChainlinkOracle = await smock.fake("AggregatorV3Interface");

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

    const constants = [rainInterpreterExtern.address, feed, staleAfter];

    const v0 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));
    const v1 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const source0 = concat([
          v0,
          v1,
          op(Opcode.EXTERN, externOperand(0, 2 ,1)),
      ]);

    const expression0 = await expressionConsumerDeploy(
      {
        sources: [source0],
        constants,
      },
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
      "NotPosIntPrice(0)",
      "did not revert when chainlink price was 0"
    );
  });

  it("extern op should correctly scale answer from 6 decimal to 18 decimal FP", async () => {
    const fakeChainlinkOracle = await smock.fake("AggregatorV3Interface");

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

    const constants = [rainInterpreterExtern.address, feed, staleAfter];

    const v0 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));
    const v1 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const source0 = concat([
          v0,
          v1,
          op(Opcode.EXTERN, externOperand(0, 2 ,1)),
      ]);

    const expression0 = await expressionConsumerDeploy(
      {
        sources: [source0],
        constants,
      },
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result0 = await logic.stackTop();

    assert(result0.eq(123 + eighteenZeros));
  });

  it("extern op should return expected value", async () => {
    const fakeChainlinkOracle2 = await smock.fake("AggregatorV3Interface");

    const timestamp = await getBlockTimestamp();

    const chainlinkPriceData = {
      roundId: 4,
      answer: 123 + eighteenZeros,
      startedAt: timestamp,
      updatedAt: timestamp,
      answeredInRound: 4,
    };

    fakeChainlinkOracle2.latestRoundData.returns(chainlinkPriceData);
    fakeChainlinkOracle2.decimals.returns(18);

    const feed = fakeChainlinkOracle2.address;
    const staleAfter = 10000;

    const constants = [rainInterpreterExtern.address, feed, staleAfter];

    const v0 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 1));
    const v1 = op(Opcode.READ_MEMORY, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const source0 = concat([
          v0,
          v1,
          op(Opcode.EXTERN, externOperand(0, 2 ,1)),
      ]);

    const expression0 = await expressionConsumerDeploy(
      {
        sources: [source0],
        constants,
      },
      rainInterpreter,
      1
    );
    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      []
    );
    const result0 = await logic.stackTop();

    assert(result0.eq(123 + eighteenZeros));
  });

  it("rainInterpreterExtern should revert with BadInputs", async () => {
    const fakeChainlinkOracle2 = await smock.fake("AggregatorV3Interface");

    const timestamp = (await getBlockTimestamp()) - 1;
    const chainlinkPriceData = {
      roundId: 4,
      answer: "123" + eighteenZeros,
      startedAt: timestamp,
      updatedAt: timestamp,
      answeredInRound: 4,
    };

    fakeChainlinkOracle2.latestRoundData.returns(chainlinkPriceData);
    fakeChainlinkOracle2.decimals.returns(18);

    const feed = fakeChainlinkOracle2.address;

    const inputs = [feed];

    await assertError(
      async () => await rainInterpreterExtern.extern(0, inputs),
      "BadInputs",
      "did not revert when incorrect inputs"
    );
  });

  it("rainInterpreterExtern should get price from oracle", async () => {
    const fakeChainlinkOracle2 = await smock.fake("AggregatorV3Interface");

    const timestamp = (await getBlockTimestamp()) - 1;
    const chainlinkPriceData = {
      roundId: 4,
      answer: "123" + eighteenZeros,
      startedAt: timestamp,
      updatedAt: timestamp,
      answeredInRound: 4,
    };

    fakeChainlinkOracle2.latestRoundData.returns(chainlinkPriceData);
    fakeChainlinkOracle2.decimals.returns(18);

    const feed = fakeChainlinkOracle2.address;
    const staleAfter = 10000;

    const inputs = [feed, staleAfter];

    const priceData = await rainInterpreterExtern.extern(0, inputs);
    assert(priceData[0].eq(123 + eighteenZeros));
  });
});
