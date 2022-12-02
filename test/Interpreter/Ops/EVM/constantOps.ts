import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type { AllStandardOpsTest } from "../../../../typechain";
import { allStandardOpsDeploy } from "../../../../utils/deploy/test/allStandardOps/deploy";
import { getBlockTimestamp } from "../../../../utils/hardhat";
import { op } from "../../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../../utils/interpreter/ops/allStandardOps";

const Opcode = AllStandardOps;

describe("RainInterpreter EInterpreter constant ops", async () => {
  let logic: AllStandardOpsTest;

  before(async () => {
    logic = await allStandardOpsDeploy();
  });

  it("should return `this` contract address", async () => {
    const constants = [];

    const source = concat([
      // (THIS_ADDRESS)
      op(Opcode.THIS_ADDRESS),
    ]);

    await logic.initialize(
      {
        sources: [source],
        constants,
      },
      [1]
    );

    await logic["run()"]();
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

    await logic.initialize(
      {
        sources: [source],
        constants,
      },
      [1]
    );

    await logic.connect(alice)["run()"]();
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

    await logic.initialize(
      {
        sources: [source],
        constants,
      },
      [1]
    );

    await logic["run()"]();
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

    await logic.initialize({ sources: [source], constants }, [1]);

    await logic["run()"]();
    const block = await ethers.provider.getBlockNumber();
    const result = await logic.stackTop();
    assert(result.eq(block), `expected block ${block} got ${result}`);
  });
});
