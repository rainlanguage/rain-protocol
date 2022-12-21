import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import type {
  IInterpreterV1Consumer,
  Rainterpreter,
  ReserveTokenERC20Snapshot,
} from "../../../../typechain";
import { SnapshotEvent } from "../../../../typechain/contracts/test/testToken/ReserveTokenERC20Snapshot";
import { basicDeploy } from "../../../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { expressionDeployConsumer } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { getEventArgs } from "../../../../utils/events";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../../utils/interpreter/ops/allStandardOps";

const Opcode = AllStandardOps;

let signers: SignerWithAddress[];
let signer1: SignerWithAddress;

let tokenERC20Snapshot: ReserveTokenERC20Snapshot;

describe("RainInterpreter ERC20 Snapshot ops", async function () {
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

  beforeEach(async () => {
    signers = await ethers.getSigners();
    signer1 = signers[1];

    tokenERC20Snapshot = (await basicDeploy(
      "ReserveTokenERC20Snapshot",
      {}
    )) as ReserveTokenERC20Snapshot;
    await tokenERC20Snapshot.initialize();
  });

  it("should return ERC20 total supply snapshot", async () => {
    const constants = [tokenERC20Snapshot.address];
    const vTokenAddr = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );

    // prettier-ignore
    const sources = [
      concat([
          vTokenAddr,
          op(Opcode.CONTEXT, 0x0000),
        op(Opcode.ERC20_SNAPSHOT_TOTAL_SUPPLY_AT)
      ]),
    ];

    const expression0 = await expressionDeployConsumer(
      {
        sources,
        constants,
      },
      rainInterpreter
    );

    const txSnapshot = await tokenERC20Snapshot.snapshot();
    const { id } = (await getEventArgs(
      txSnapshot,
      "Snapshot",
      tokenERC20Snapshot
    )) as SnapshotEvent["args"];

    await logic.eval(rainInterpreter.address, expression0.dispatch, [[id]]);
    const result0 = await logic.stackTop();
    const totalTokenSupply = await tokenERC20Snapshot.totalSupply();
    assert(
      result0.eq(totalTokenSupply),
      `expected ${totalTokenSupply}, got ${result0}`
    );
  });

  it("should return ERC20 balance snapshot", async () => {
    const constants = [signer1.address, tokenERC20Snapshot.address];
    const vSigner1 = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 0)
    );
    const vTokenAddr = op(
      Opcode.READ_MEMORY,
      memoryOperand(MemoryType.Constant, 1)
    );

    // prettier-ignore
    const sources = [
      concat([
          vTokenAddr,
          vSigner1,
          op(Opcode.CONTEXT, 0x0000),
        op(Opcode.ERC20_SNAPSHOT_BALANCE_OF_AT)
      ]),
    ];

    const expression0 = await expressionDeployConsumer(
      {
        sources,
        constants,
      },
      rainInterpreter
    );

    await tokenERC20Snapshot.transfer(signer1.address, 100);

    const txSnapshot = await tokenERC20Snapshot.snapshot();
    const { id } = (await getEventArgs(
      txSnapshot,
      "Snapshot",
      tokenERC20Snapshot
    )) as SnapshotEvent["args"];

    await logic.eval(rainInterpreter.address, expression0.dispatch, [[id]]);
    const result1 = await logic.stackTop();
    assert(result1.eq(100), `expected 100, got ${result1}`);
  });
});
