import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  FlowERC20Factory,
  FlowFactory,
  FlowIntegrity,
} from "../../../typechain";
import {
  InitializeEvent,
  StateConfigStruct,
} from "../../../typechain/contracts/flow/Flow";
import { FlowERC20ConfigStruct } from "../../../typechain/contracts/flow/FlowERC20";
import { flowDeploy, flowERC20Deploy } from "../../../utils/deploy/flow/flow";
import { getEventArgs } from "../../../utils/events";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { memoryOperand, MemoryType, op } from "../../../utils/rainvm/vm";
import { compareStructs } from "../../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe("FlowERC20 construction tests", async function () {
  let integrity: FlowIntegrity;
  let flowERC20Factory: FlowERC20Factory;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory("FlowIntegrity");
    integrity = (await integrityFactory.deploy()) as FlowIntegrity;
    await integrity.deployed();

    const flowERC20FactoryFactory = await ethers.getContractFactory(
      "FlowERC20Factory",
      {}
    );
    flowERC20Factory = (await flowERC20FactoryFactory.deploy(
      integrity.address
    )) as FlowERC20Factory;
    await flowERC20Factory.deployed();
  });

  it("should initialize on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const constants = [1, 2];

    // prettier-ignore
    const sourceCanFlow = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0)),
    ]);

    // prettier-ignore
    const sourceFlowIO = concat([
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1)),
    ]);

    const sources = [sourceCanFlow, sourceFlowIO];

    const configStruct: FlowERC20ConfigStruct = {
      name: "tokenERC20",
      symbol: "TKN",
      vmStateConfig: {
        sources,
        constants,
      },
    };

    const flow = await flowERC20Deploy(
      deployer,
      flowERC20Factory,
      configStruct
    );

    const { sender, config } = (await getEventArgs(
      flow.deployTransaction,
      "Initialize",
      flow
    )) as InitializeEvent["args"];

    assert(
      sender === flowERC20Factory.address,
      "wrong sender in Initialize event"
    );

    compareStructs(config, configStruct);
  });
});
