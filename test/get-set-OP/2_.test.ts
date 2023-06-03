import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import {
  EvaluableStructOutput,
  Flow,
  FlowInitializedEvent,
} from "../../typechain/contracts/flow/basic/Flow";
import { getEvents } from "../../utils";
import { deployFlowClone } from "../../utils/deploy/flow/basic/deploy";
import {
  cloneFactory,
  flowConfig,
  implementation,
} from "./1_deploy.test";

describe("GET-SET test", () => {
  let signers: SignerWithAddress[];
  let deployer: SignerWithAddress;
  let flowContract: Flow;
  let dispatchSet: EvaluableStructOutput,
  dispatchGet: EvaluableStructOutput;

  beforeEach(async () => {
    signers = await ethers.getSigners();
    deployer = signers[0];

    const { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfig
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    flowContract = flow;
    dispatchSet = flowInitialized[0].evaluable;
    dispatchGet = flowInitialized[1].evaluable;
  });

  it("Should be able to set and get the store value", async () => {
    await flowContract
      .connect(deployer)
      .flow(dispatchSet, [], []);

    await flowContract
      .connect(deployer)
      .flow(dispatchGet, [], []);
  });
});
