import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { ethers } from "hardhat";
import type {
  IInterpreterV1Consumer,
  Rainterpreter,
  ReserveTokenERC20Snapshot,
} from "../../../../typechain";
import { SnapshotEvent } from "../../../../typechain/contracts/test/testToken/ReserveTokenERC20Snapshot";
import { basicDeploy } from "../../../../utils/deploy/basicDeploy";
import { rainterpreterDeploy } from "../../../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import deploy1820 from "../../../../utils/deploy/registry1820/deploy";
import { expressionConsumerDeploy } from "../../../../utils/deploy/test/iinterpreterV1Consumer/deploy";
import { getEventArgs } from "../../../../utils/events";
import { standardEvaluableConfig } from "../../../../utils/interpreter/interpreter";

let signers: SignerWithAddress[];
let signer1: SignerWithAddress;

let tokenERC20Snapshot: ReserveTokenERC20Snapshot;

describe("RainInterpreter ERC20 Snapshot ops", async function () {
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
    const { sources, constants } = standardEvaluableConfig(
      `snapshot-id: context<0 0>(),
      _: erc-20-snapshot-total-supply-at(
        ${tokenERC20Snapshot.address}
        snapshot-id
      );`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
      rainInterpreter,
      1
    );

    const txSnapshot = await tokenERC20Snapshot.snapshot();
    const { id } = (await getEventArgs(
      txSnapshot,
      "Snapshot",
      tokenERC20Snapshot
    )) as SnapshotEvent["args"];

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      [[id]]
    );
    const result0 = await logic.stackTop();
    const totalTokenSupply = await tokenERC20Snapshot.totalSupply();
    assert(
      result0.eq(totalTokenSupply),
      `expected ${totalTokenSupply}, got ${result0}`
    );
  });

  it("should return ERC20 balance snapshot", async () => {
    const { sources, constants } = standardEvaluableConfig(
      `snapshot-id: context<0 0>(),
      _: erc-20-snapshot-balance-of-at(
        ${tokenERC20Snapshot.address}
        ${signer1.address}
        snapshot-id
      );`
    );

    const expression0 = await expressionConsumerDeploy(
      sources,
      constants,
      rainInterpreter,
      1
    );

    await tokenERC20Snapshot.transfer(signer1.address, 100);

    const txSnapshot = await tokenERC20Snapshot.snapshot();
    const { id } = (await getEventArgs(
      txSnapshot,
      "Snapshot",
      tokenERC20Snapshot
    )) as SnapshotEvent["args"];

    await logic["eval(address,uint256,uint256[][])"](
      rainInterpreter.address,
      expression0.dispatch,
      [[id]]
    );
    const result1 = await logic.stackTop();
    assert(result1.eq(100), `expected 100, got ${result1}`);
  });
});
