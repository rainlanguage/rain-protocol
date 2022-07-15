import { assert } from "chai";
import { concat, hexlify } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { AllStandardOpsStateBuilder } from "../../typechain/AllStandardOpsStateBuilder";
import { AllStandardOpsTest } from "../../typechain/AllStandardOpsTest";
import { ReserveToken } from "../../typechain/ReserveToken";
import { StakeConfigStruct } from "../../typechain/Stake";
import { StakeFactory } from "../../typechain/StakeFactory";
import { max_uint256, ONE, sixZeros } from "../../utils/constants/bigNumber";
import { THRESHOLDS } from "../../utils/constants/stake";
import { basicDeploy } from "../../utils/deploy/basic";
import { stakeDeploy } from "../../utils/deploy/stake";
import { getBlockTimestamp, timewarp } from "../../utils/hardhat";
import { Opcode } from "../../utils/rainvm/ops/allStandardOps";
import { op } from "../../utils/rainvm/vm";
import { numArrayToReport } from "../../utils/tier";

describe("Stake report Ops", async function () {
  let stakeFactory: StakeFactory;
  let token: ReserveToken;
  let stateBuilder: AllStandardOpsStateBuilder;
  let logic: AllStandardOpsTest;

  const CONTEXT_ = {
    constants: THRESHOLDS,
    sources: concat([
      op(Opcode.CONSTANT, 1),
      op(Opcode.CONSTANT, 2),
      op(Opcode.CONSTANT, 3),
      op(Opcode.CONSTANT, 4),
      op(Opcode.CONSTANT, 5),
      op(Opcode.CONSTANT, 6),
      op(Opcode.CONSTANT, 7),
      op(Opcode.CONSTANT, 8),
    ])
  }

  before(async () => {
    const stakeFactoryFactory = await ethers.getContractFactory(
      "StakeFactory",
      {}
    );
    stakeFactory = (await stakeFactoryFactory.deploy()) as StakeFactory;
    await stakeFactory.deployed();

    const stateBuilderFactory = await ethers.getContractFactory(
      "AllStandardOpsStateBuilder"
    );
    stateBuilder =
      (await stateBuilderFactory.deploy()) as AllStandardOpsStateBuilder;
    await stateBuilder.deployed();

    const logicFactory = await ethers.getContractFactory("AllStandardOpsTest");
    logic = (await logicFactory.deploy(
      stateBuilder.address
    )) as AllStandardOpsTest;
  });

  beforeEach(async () => {
    token = (await basicDeploy("ReserveToken", {})) as ReserveToken;
  });


  it("should return a correct report using ITIERV2_REPORT when no token has been staked", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: ONE,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // prettier-ignore
    const source = concat([
      op(Opcode.CONSTANT, 0), // ITierV2 contract
      op(Opcode.SENDER), // address
      op(Opcode.ITIERV2_REPORT)
    ]);

    await logic.initialize({
      sources: [source],
      constants: [stake.address],
    });

    await logic.connect(alice).run();
    const result = await logic.stackTop();

    assert(result.eq(max_uint256), "did not return a NEVER report");
  });


  it.only("should return a correct report using ITIERV2_REPORT when enough tokens have been staked to exceed the 1st threshold", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const alice = signers[2];

    const stakeConfigStruct: StakeConfigStruct = {
      name: "Stake Token",
      symbol: "STKN",
      token: token.address,
      initialRatio: ONE,
    };

    const stake = await stakeDeploy(deployer, stakeFactory, stakeConfigStruct);

    // Give Alice reserve tokens and desposit them
    const depositAmount0 = THRESHOLDS[0].add(1);
    await token.transfer(alice.address, depositAmount0);
    await token.connect(alice).approve(stake.address, depositAmount0);
    await stake.connect(alice).deposit(depositAmount0);

    const depositTimestamp = await getBlockTimestamp();

    // prettier-ignore
    // Passing context data in constants
    let source = concat([
      op(Opcode.CONSTANT, 0), // ITierV2 contract
      op(Opcode.SENDER), // address
      op(Opcode.CONSTANT, 1),
      op(Opcode.CONSTANT, 2),
      op(Opcode.CONSTANT, 3),
      op(Opcode.CONSTANT, 4),
      op(Opcode.CONSTANT, 5),
      op(Opcode.CONSTANT, 6),
      op(Opcode.CONSTANT, 7),
      op(Opcode.CONSTANT, 8),
      op(Opcode.ITIERV2_REPORT, THRESHOLDS.length)
    ]);

    await logic.initialize({
      sources: [source],
      constants: [stake.address, ...THRESHOLDS],
    });

    await logic.connect(alice).run();

    const result = await logic.stackTop();

    console.log(result);

    // // prettier-ignore
    // // Passing context and running using runContext
    // source = concat([
    //   op(Opcode.CONSTANT, 0), // ITierV2 contract
    //   op(Opcode.SENDER), // address
    //   op(Opcode.CONTEXT, 0),
    //   op(Opcode.CONTEXT, 1),
    //   op(Opcode.CONTEXT, 2),
    //   op(Opcode.CONTEXT, 3),
    //   op(Opcode.CONTEXT, 4),
    //   op(Opcode.CONTEXT, 5),
    //   op(Opcode.CONTEXT, 6),
    //   op(Opcode.CONTEXT, 7),
    //   op(Opcode.ITIERV2_REPORT, THRESHOLDS.length)
    // ]);

    // await logic.initialize({
    //   sources: [source],
    //   constants: [stake.address],
    // });

    // await logic.connect(alice).runContext(THRESHOLDS);

    // const result = await logic.stackTop();
  });


});
