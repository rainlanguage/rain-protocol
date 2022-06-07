import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { Contract } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllStandardOpsStateBuilder } from "../../../../typechain/AllStandardOpsStateBuilder";
import { AllStandardOpsTest } from "../../../../typechain/AllStandardOpsTest";
import {
  ReserveTokenERC20Snapshot,
  SnapshotEvent,
} from "../../../../typechain/ReserveTokenERC20Snapshot";
import { basicDeploy } from "../../../../utils/deploy/basic";
import { getEventArgs } from "../../../../utils/events";
import { AllStandardOps } from "../../../../utils/rainvm/ops/allStandardOps";
import { op } from "../../../../utils/rainvm/vm";

const Opcode = AllStandardOps;

let signers: SignerWithAddress[];
let signer1: SignerWithAddress;

let tokenERC20Snapshot: ReserveTokenERC20Snapshot;

describe("RainVM ERC20 Snapshot ops", async function () {
  let stateBuilder: AllStandardOpsStateBuilder & Contract;
  let logic: AllStandardOpsTest & Contract;

  before(async () => {
    this.timeout(0);
    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsStateBuilder"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as AllStandardOpsStateBuilder &
        Contract;
    await stateBuilder.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      stateBuilder.address
    )) as AllStandardOpsTest & Contract;
  });

  beforeEach(async () => {
    signers = await ethers.getSigners();
    signer1 = signers[1];

    tokenERC20Snapshot = (await basicDeploy(
      "ReserveTokenERC20Snapshot",
      {}
    )) as ReserveTokenERC20Snapshot & Contract;
  });

  it("should return ERC20 total supply snapshot", async () => {
    this.timeout(0);

    const constants = [tokenERC20Snapshot.address];
    const vTokenAddr = op(Opcode.CONSTANT, 0);

    // prettier-ignore
    const sources = [
      concat([
          vTokenAddr,
          op(Opcode.CONTEXT),
        op(Opcode.ERC20_SNAPSHOT_TOTAL_SUPPLY_AT)
      ]),
    ];

    await logic.initialize({ sources, constants });

    const txSnapshot = await tokenERC20Snapshot.snapshot();
    const { id } = (await getEventArgs(
      txSnapshot,
      "Snapshot",
      tokenERC20Snapshot
    )) as SnapshotEvent["args"];

    await logic.runContext([id]);
    const result0 = await logic.stackTop();
    const totalTokenSupply = await tokenERC20Snapshot.totalSupply();
    assert(
      result0.eq(totalTokenSupply),
      `expected ${totalTokenSupply}, got ${result0}`
    );
  });

  it("should return ERC20 balance snapshot", async () => {
    this.timeout(0);

    const constants = [signer1.address, tokenERC20Snapshot.address];
    const vSigner1 = op(Opcode.CONSTANT, 0);
    const vTokenAddr = op(Opcode.CONSTANT, 1);

    // prettier-ignore
    const sources = [
      concat([
          vTokenAddr,
          vSigner1,
          op(Opcode.CONTEXT),
        op(Opcode.ERC20_SNAPSHOT_BALANCE_OF_AT)
      ]),
    ];

    await logic.initialize({ sources, constants });

    await tokenERC20Snapshot.transfer(signer1.address, 100);

    const txSnapshot = await tokenERC20Snapshot.snapshot();
    const { id } = (await getEventArgs(
      txSnapshot,
      "Snapshot",
      tokenERC20Snapshot
    )) as SnapshotEvent["args"];

    await logic.runContext([id]);
    const result1 = await logic.stackTop();
    assert(result1.eq(100), `expected 100, got ${result1}`);
  });
});
