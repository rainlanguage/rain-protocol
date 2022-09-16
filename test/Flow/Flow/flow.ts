import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowFactory, FlowIntegrity } from "../../../typechain";
import {
  FlowIOStruct,
  StateConfigStruct,
} from "../../../typechain/contracts/flow/Flow";
import { sixZeros } from "../../../utils/constants/bigNumber";
import { RAIN_FLOW_SENTINEL } from "../../../utils/constants/sentinel";
import { flowDeploy } from "../../../utils/deploy/flow/flow";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { memoryOperand, MemoryType, op } from "../../../utils/rainvm/vm";

const Opcode = AllStandardOps;

describe("Flow flow tests", async function () {
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

  xit("should flow for native tokens on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const flowIO: FlowIOStruct = {
      inputNative: 1,
      outputNative: 2,
      inputs20: [],
      outputs20: [],
      inputs721: [],
      outputs721: [],
      inputs1155: [],
      outputs1155: [],
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowIO.inputNative,
      flowIO.outputNative,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const sourceCanFlow = concat([
      CAN_FLOW(), // true
    ]);

    const sourceFlowIO = concat([
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      FLOWIO_OUTPUT_NATIVE(),
      FLOWIO_INPUT_NATIVE(),
    ]);

    const sources = [sourceCanFlow, sourceFlowIO];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowDeploy(deployer, flowFactory, stateConfigStruct);

    const you = signers[1];
    const me = flow;

    // give Ether to parties
    await signers[0].sendTransaction({
      to: you.address,
      value: ethers.utils.parseEther(flowIO.inputNative.toString()),
    });
    await signers[0].sendTransaction({
      to: me.address,
      value: ethers.utils.parseEther(flowIO.outputNative.toString()),
    });

    // signer approves Ether transfer ?
    // await signers[0].sendTransaction({
    //   to: me.address,
    //   value: ethers.utils.parseEther(flowIO.outputNative.toString()),
    // });

    // const txFlow = await flow.connect(you).flow(1, 1234);

    // const flowStruct = await flow.callStatic.flow(1, 1234);

    // compareStructs(flowStruct, flowIO);
  });

  it.only("should receive Ether", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const flowIO: FlowIOStruct = {
      inputNative: 1,
      outputNative: 2,
      inputs20: [],
      outputs20: [],
      inputs721: [],
      outputs721: [],
      inputs1155: [],
      outputs1155: [],
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowIO.inputNative,
      flowIO.outputNative,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const sourceCanFlow = concat([
      CAN_FLOW(), // true
    ]);

    const sourceFlowIO = concat([
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      FLOWIO_OUTPUT_NATIVE(),
      FLOWIO_INPUT_NATIVE(),
    ]);

    const sources = [sourceCanFlow, sourceFlowIO];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowDeploy(deployer, flowFactory, stateConfigStruct);

    await signers[0].sendTransaction({
      to: flow.address,
      value: ethers.utils.parseEther(flowIO.outputNative.toString()),
    });
  });
});
