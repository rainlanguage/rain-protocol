import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowFactory, FlowIntegrity } from "../../../typechain";
import {
  InitializeEvent,
  StateConfigStruct,
} from "../../../typechain/contracts/flow/Flow";
import { RAIN_FLOW_SENTINEL } from "../../../utils/constants/sentinel";
import { flowDeploy } from "../../../utils/deploy/flow/flow";
import { getEventArgs } from "../../../utils/events";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { memoryOperand, MemoryType, op } from "../../../utils/rainvm/vm";
import { compareStructs } from "../../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe("Flow construction", async function () {
  let integrity: FlowIntegrity;
  let flowFactory: FlowFactory;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory("FlowIntegrity");
    integrity = (await integrityFactory.deploy()) as FlowIntegrity;
    await integrity.deployed();

    const flowFactoryFactory = await ethers.getContractFactory(
      "FlowFactory",
      {}
    );
    flowFactory = (await flowFactoryFactory.deploy(
      integrity.address
    )) as FlowFactory;
    await flowFactory.deployed();
  });

  it("should initialize on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const constants = [RAIN_FLOW_SENTINEL, 1, 2];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));

    // prettier-ignore
    const sourceCanFlow = concat([
      SENTINEL(),
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
    ]);

    // prettier-ignore
    const sourceFlow0 = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2)),
    ]);

    const sources = [sourceCanFlow, sourceFlow0];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowDeploy(deployer, flowFactory, stateConfigStruct);

    const { sender, config } = (await getEventArgs(
      flow.deployTransaction,
      "Initialize",
      flow
    )) as InitializeEvent["args"];

    assert(sender === flowFactory.address, "wrong sender in Initialize event");

    compareStructs(config, stateConfigStruct);

    const previewFlow_ = await flow.previewFlow(1, 0);

    console.log({ previewFlow_ });
  });
});
