import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  FlowFactory,
  FlowIntegrity,
  ReserveToken,
  ReserveTokenERC1155,
  ReserveTokenERC721,
} from "../../../typechain";
import {
  FlowIOStruct,
  StateConfigStruct,
} from "../../../typechain/contracts/flow/Flow";
import { RAIN_FLOW_SENTINEL } from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basic";
import { flowDeploy } from "../../../utils/deploy/flow/flow";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { memoryOperand, MemoryType, op } from "../../../utils/rainvm/vm";
import { assertError } from "../../../utils/test/assertError";
import { compareStructs } from "../../../utils/test/compareStructs";

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

  xit("should preview defined flow IO for ERC1155 (single element arrays)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const erc1155 = (await basicDeploy(
      "ReserveTokenERC1155",
      {}
    )) as ReserveTokenERC1155;
    await erc1155.initialize();

    const flowIO: FlowIOStruct = {
      inputNative: 0,
      outputNative: 0,
      inputs20: [],
      outputs20: [],
      inputs721: [],
      outputs721: [],
      inputs1155: [{ token: erc1155.address, id: 1, amount: 2 }],
      outputs1155: [{ token: erc1155.address, id: 3, amount: 4 }],
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowIO.inputNative,
      flowIO.outputNative,
      flowIO.inputs1155[0].token,
      flowIO.inputs1155[0].id,
      flowIO.inputs1155[0].amount,
      flowIO.outputs1155[0].token,
      flowIO.outputs1155[0].id,
      flowIO.outputs1155[0].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_INPUT_ERC1155_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWIO_INPUT_ERC1155_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWIO_INPUT_ERC1155_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWIO_OUTPUT_ERC1155_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));
    const FLOWIO_OUTPUT_ERC1155_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));
    const FLOWIO_OUTPUT_ERC1155_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 9));

    // prettier-ignore
    const sourceCanFlow = concat([
      CAN_FLOW(), // true
    ]);

    const sourceFlowIO = concat([
      SENTINEL(),
      FLOWIO_OUTPUT_ERC1155_AMOUNT(),
      FLOWIO_OUTPUT_ERC1155_ID(),
      FLOWIO_OUTPUT_ERC1155_TOKEN(),
      SENTINEL(),
      FLOWIO_INPUT_ERC1155_AMOUNT(),
      FLOWIO_INPUT_ERC1155_ID(),
      FLOWIO_INPUT_ERC1155_TOKEN(),
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

    const flowIOPreview = await flow.previewFlow(1, 1234);

    compareStructs(flowIOPreview, flowIO, true);
  });

  xit("should preview defined flow IO for ERC721 (single element arrays)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const erc721 = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721.initialize();

    const flowIO: FlowIOStruct = {
      inputNative: 0,
      outputNative: 0,
      inputs20: [],
      outputs20: [],
      inputs721: [{ token: erc721.address, id: 1 }],
      outputs721: [{ token: erc721.address, id: 2 }],
      inputs1155: [],
      outputs1155: [],
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowIO.inputNative,
      flowIO.outputNative,
      flowIO.inputs721[0].token,
      flowIO.inputs721[0].id,
      flowIO.outputs721[0].token,
      flowIO.outputs721[0].id,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_INPUT_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWIO_INPUT_ERC721_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWIO_OUTPUT_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWIO_OUTPUT_ERC721_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));

    // prettier-ignore
    const sourceCanFlow = concat([
      CAN_FLOW(), // true
    ]);

    const sourceFlowIO = concat([
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      FLOWIO_OUTPUT_ERC721_ID(),
      FLOWIO_OUTPUT_ERC721_TOKEN(),
      SENTINEL(),
      FLOWIO_INPUT_ERC721_ID(),
      FLOWIO_INPUT_ERC721_TOKEN(),
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

    const flowIOPreview = await flow.previewFlow(1, 1234);

    compareStructs(flowIOPreview, flowIO, true);
  });

  it("should preview defined flow IO for ERC20 (single element arrays)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const erc20 = (await basicDeploy("ReserveToken", {})) as ReserveToken;
    await erc20.initialize();

    const flowIO: FlowIOStruct = {
      inputNative: 0,
      outputNative: 0,
      inputs20: [{ token: erc20.address, amount: 1 }],
      outputs20: [{ token: erc20.address, amount: 2 }],
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
      flowIO.inputs20[0].token,
      flowIO.inputs20[0].amount,
      flowIO.outputs20[0].token,
      flowIO.outputs20[0].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_INPUT_ERC20_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWIO_INPUT_ERC20_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWIO_OUTPUT_ERC20_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWIO_OUTPUT_ERC20_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));

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
      FLOWIO_OUTPUT_ERC20_AMOUNT(),
      FLOWIO_OUTPUT_ERC20_TOKEN(),
      SENTINEL(),
      FLOWIO_INPUT_ERC20_AMOUNT(),
      FLOWIO_INPUT_ERC20_TOKEN(),
      FLOWIO_OUTPUT_NATIVE(),
      FLOWIO_INPUT_NATIVE(),
    ]);

    const sources = [sourceCanFlow, sourceFlowIO];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowDeploy(deployer, flowFactory, stateConfigStruct);

    const flowIOPreview = await flow.previewFlow(1, 1234);

    compareStructs(flowIOPreview, flowIO, true);
  });

  it("should not flow if canFlow eval returns 0", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const flowIO: FlowIOStruct = {
      inputNative: 0,
      outputNative: 0,
      inputs20: [],
      outputs20: [],
      inputs721: [],
      outputs721: [],
      inputs1155: [],
      outputs1155: [],
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      0,
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
      CAN_FLOW(), // false
    ]);

    // prettier-ignore
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

    await assertError(
      async () => await flow.previewFlow(1, 1234),
      "CANT_FLOW",
      "flowed when it should not"
    );
  });

  it("should preview empty flow io", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const flowIO: FlowIOStruct = {
      inputNative: 0,
      outputNative: 0,
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

    // prettier-ignore
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

    const flowIOPreview = await flow.previewFlow(1, 1234);

    compareStructs(flowIOPreview, flowIO);
  });
});
