import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { expressionDeployConsumer } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { getBlockTimestamp } from "../../../../utils/hardhat";
import { op } from "../../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../../utils/interpreter/ops/allStandardOps";

const Opcode = AllStandardOps;

describe("RainInterpreter EInterpreter constant ops", async () => {
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

  it("should return `this` contract address", async () => {
    const constants = [];

    const source = concat([
      // (THIS_ADDRESS)
      op(Opcode.THIS_ADDRESS),
    ]);

    const expression0 = await expressionDeployConsumer(
      {
        sources: [source],
        constants,
      },
      rainInterpreter
    );

    await logic.eval(rainInterpreter.address, expression0.dispatch, []);
    const result = await logic.stackTop();

    assert(
      result.eq(logic.address),
      `wrong this address
      expected  ${logic.address}
      got       ${result}`
    );
  });

  it("should return caller/sender", async () => {
    const signers = await ethers.getSigners();

    const alice = signers[1];

    const constants = [];

    const source = concat([
      // (SENDER)
      op(Opcode.CALLER),
    ]);

    const expression0 = await expressionDeployConsumer(
      {
        sources: [source],
        constants,
      },
      rainInterpreter
    );

    await logic
      .connect(alice)
      .eval(rainInterpreter.address, expression0.dispatch, []);
    const result = await logic.stackTop();

    assert(
      result.eq(alice.address),
      `wrong sender
      expected  ${alice.address}
      got       ${result}`
    );
  });

  it("should return block.timestamp", async () => {
    const constants = [];

    const source = concat([
      // (BLOCK_TIMESTAMP)
      op(Opcode.BLOCK_TIMESTAMP),
    ]);

    const expression0 = await expressionDeployConsumer(
      {
        sources: [source],
        constants,
      },
      rainInterpreter
    );

    await logic.eval(rainInterpreter.address, expression0.dispatch, []);
    const timestamp = await getBlockTimestamp();
    const result = await logic.stackTop();

    assert(
      result.eq(timestamp),
      `expected timestamp ${timestamp} got ${result}`
    );
  });

  it("should return block.number", async () => {
    const constants = [];

    const source = concat([
      // (BLOCK_NUMBER)
      op(Opcode.BLOCK_NUMBER),
    ]);

    const expression0 = await expressionDeployConsumer(
      {
        sources: [source],
        constants,
      },
      rainInterpreter
    );

    await logic.eval(rainInterpreter.address, expression0.dispatch, []);
    const block = await ethers.provider.getBlockNumber();
    const result = await logic.stackTop();
    assert(result.eq(block), `expected block ${block} got ${result}`);
  });
});
