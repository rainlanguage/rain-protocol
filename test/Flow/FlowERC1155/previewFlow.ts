import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  FlowERC1155Factory,
  FlowIntegrity,
  ReserveToken,
  ReserveTokenERC1155,
  ReserveTokenERC721,
} from "../../../typechain";
import {
  FlowIOStruct,
  StateConfigStruct,
} from "../../../typechain/contracts/flow/Flow";
import { sixZeros } from "../../../utils/constants/bigNumber";
import {
  RAIN_FLOW_ERC1155_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basic";
import { flowERC1155Deploy } from "../../../utils/deploy/flow/flow";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { memoryOperand, MemoryType, op } from "../../../utils/rainvm/vm";
import { assertError } from "../../../utils/test/assertError";
import { compareStructs } from "../../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe("FlowERC1155 previewFlow tests", async function () {
  let integrity: FlowIntegrity;
  let flowFactory: FlowERC1155Factory;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory("FlowIntegrity");
    integrity = (await integrityFactory.deploy()) as FlowIntegrity;
    await integrity.deployed();

    const flowFactoryFactory = await ethers.getContractFactory(
      "FlowERC1155Factory",
      {}
    );
    flowFactory = (await flowFactoryFactory.deploy(
      integrity.address
    )) as FlowERC1155Factory;
    await flowFactory.deployed();
  });

  it("should preview defined flow IO for native Ether", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const flowIO: FlowIOStruct = {
      inputNative: ethers.BigNumber.from(1 + sixZeros),
      outputNative: ethers.BigNumber.from(2 + sixZeros),
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
    const TRUE = () => op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));

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

    const sources = [TRUE(), TRUE(), TRUE(), sourceFlowIO];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC1155Deploy(deployer, flowFactory, {
      uri: "F1155",
      vmStateConfig: stateConfigStruct,
    });

    const flowIOPreview = await flow.previewFlow(sources.length - 1, 1234);

    compareStructs(flowIOPreview, flowIO, true);
  });

  it("should preview defined flow IO for ERC1155 (multi element arrays)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const erc1155A = (await basicDeploy(
      "ReserveTokenERC1155",
      {}
    )) as ReserveTokenERC1155;
    await erc1155A.initialize();
    const erc1155B = (await basicDeploy(
      "ReserveTokenERC1155",
      {}
    )) as ReserveTokenERC1155;
    await erc1155B.initialize();

    const flowIO: FlowIOStruct = {
      inputNative: 0,
      outputNative: 0,
      inputs20: [],
      outputs20: [],
      inputs721: [],
      outputs721: [],
      inputs1155: [
        { token: erc1155A.address, id: 1, amount: 2 },
        { token: erc1155B.address, id: 3, amount: 4 },
      ],
      outputs1155: [
        { token: erc1155A.address, id: 5, amount: 6 },
        { token: erc1155B.address, id: 7, amount: 8 },
      ],
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      flowIO.inputNative,
      flowIO.outputNative,
      flowIO.inputs1155[0].token,
      flowIO.inputs1155[0].id,
      flowIO.inputs1155[0].amount,
      flowIO.inputs1155[1].token,
      flowIO.inputs1155[1].id,
      flowIO.inputs1155[1].amount,
      flowIO.outputs1155[0].token,
      flowIO.outputs1155[0].id,
      flowIO.outputs1155[0].amount,
      flowIO.outputs1155[1].token,
      flowIO.outputs1155[1].id,
      flowIO.outputs1155[1].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const TRUE = () => op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const FLOWIO_INPUT_ERC1155_TOKEN_A = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWIO_INPUT_ERC1155_ID_A = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWIO_INPUT_ERC1155_AMOUNT_A = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));
    const FLOWIO_INPUT_ERC1155_TOKEN_B = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));
    const FLOWIO_INPUT_ERC1155_ID_B = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 9));
    const FLOWIO_INPUT_ERC1155_AMOUNT_B = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 10));

    const FLOWIO_OUTPUT_ERC1155_TOKEN_A = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 11));
    const FLOWIO_OUTPUT_ERC1155_ID_A = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 12));
    const FLOWIO_OUTPUT_ERC1155_AMOUNT_A = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 13));
    const FLOWIO_OUTPUT_ERC1155_TOKEN_B = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 14));
    const FLOWIO_OUTPUT_ERC1155_ID_B = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 15));
    const FLOWIO_OUTPUT_ERC1155_AMOUNT_B = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 16));

    const sourceFlowIO = concat([
      SENTINEL(),
      FLOWIO_OUTPUT_ERC1155_TOKEN_A(),
      FLOWIO_OUTPUT_ERC1155_ID_A(),
      FLOWIO_OUTPUT_ERC1155_AMOUNT_A(),
      FLOWIO_OUTPUT_ERC1155_TOKEN_B(),
      FLOWIO_OUTPUT_ERC1155_ID_B(),
      FLOWIO_OUTPUT_ERC1155_AMOUNT_B(),
      SENTINEL(),
      FLOWIO_INPUT_ERC1155_TOKEN_A(),
      FLOWIO_INPUT_ERC1155_ID_A(),
      FLOWIO_INPUT_ERC1155_AMOUNT_A(),
      FLOWIO_INPUT_ERC1155_TOKEN_B(),
      FLOWIO_INPUT_ERC1155_ID_B(),
      FLOWIO_INPUT_ERC1155_AMOUNT_B(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      FLOWIO_OUTPUT_NATIVE(),
      FLOWIO_INPUT_NATIVE(),
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [TRUE(), TRUE(), TRUE(), sourceFlowIO];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC1155Deploy(deployer, flowFactory, {
      uri: "F1155",
      vmStateConfig: stateConfigStruct,
    });

    const flowIOPreview = await flow.previewFlow(sources.length - 1, 1234);

    compareStructs(flowIOPreview, flowIO, true);
  });

  it("should preview defined flow IO for ERC721 (multi element arrays)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const erc721A = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721A.initialize();
    const erc721B = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721B.initialize();

    const flowIO: FlowIOStruct = {
      inputNative: 0,
      outputNative: 0,
      inputs20: [],
      outputs20: [],
      inputs721: [
        { token: erc721A.address, id: 1 },
        { token: erc721B.address, id: 2 },
      ],
      outputs721: [
        { token: erc721A.address, id: 3 },
        { token: erc721B.address, id: 4 },
      ],
      inputs1155: [],
      outputs1155: [],
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      flowIO.inputNative,
      flowIO.outputNative,
      flowIO.inputs721[0].token,
      flowIO.inputs721[0].id,
      flowIO.inputs721[1].token,
      flowIO.inputs721[1].id,
      flowIO.outputs721[0].token,
      flowIO.outputs721[0].id,
      flowIO.outputs721[1].token,
      flowIO.outputs721[1].id,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const TRUE = () => op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const FLOWIO_INPUT_ERC721_TOKEN_A = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWIO_INPUT_ERC721_ID_A = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWIO_INPUT_ERC721_TOKEN_B = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));
    const FLOWIO_INPUT_ERC721_ID_B = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));

    const FLOWIO_OUTPUT_ERC721_TOKEN_A = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 9));
    const FLOWIO_OUTPUT_ERC721_ID_A = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 10));
    const FLOWIO_OUTPUT_ERC721_TOKEN_B = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 11));
    const FLOWIO_OUTPUT_ERC721_ID_B = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 12));

    const sourceFlowIO = concat([
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      FLOWIO_OUTPUT_ERC721_TOKEN_A(),
      FLOWIO_OUTPUT_ERC721_ID_A(),
      FLOWIO_OUTPUT_ERC721_TOKEN_B(),
      FLOWIO_OUTPUT_ERC721_ID_B(),
      SENTINEL(),
      FLOWIO_INPUT_ERC721_TOKEN_A(),
      FLOWIO_INPUT_ERC721_ID_A(),
      FLOWIO_INPUT_ERC721_TOKEN_B(),
      FLOWIO_INPUT_ERC721_ID_B(),
      SENTINEL(),
      SENTINEL(),
      FLOWIO_OUTPUT_NATIVE(),
      FLOWIO_INPUT_NATIVE(),
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [TRUE(), TRUE(), TRUE(), sourceFlowIO];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC1155Deploy(deployer, flowFactory, {
      uri: "F1155",
      vmStateConfig: stateConfigStruct,
    });

    const flowIOPreview = await flow.previewFlow(sources.length - 1, 1234);

    compareStructs(flowIOPreview, flowIO, true);
  });

  it("should preview defined flow IO for ERC20 (multi element arrays)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const erc20A = (await basicDeploy("ReserveToken", {})) as ReserveToken;
    await erc20A.initialize();
    const erc20B = (await basicDeploy("ReserveToken", {})) as ReserveToken;
    await erc20B.initialize();

    const flowIO: FlowIOStruct = {
      inputNative: 10,
      outputNative: 50,
      inputs20: [
        { token: erc20A.address, amount: 1 },
        { token: erc20B.address, amount: 2 },
      ],
      outputs20: [
        { token: erc20A.address, amount: 3 },
        { token: erc20B.address, amount: 4 },
      ],
      inputs721: [],
      outputs721: [],
      inputs1155: [],
      outputs1155: [],
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      flowIO.inputNative,
      flowIO.outputNative,
      flowIO.inputs20[0].token,
      flowIO.inputs20[0].amount,
      flowIO.inputs20[1].token,
      flowIO.inputs20[1].amount,
      flowIO.outputs20[0].token,
      flowIO.outputs20[0].amount,
      flowIO.outputs20[1].token,
      flowIO.outputs20[1].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const TRUE = () => op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const FLOWIO_INPUT_ERC20_TOKEN_A = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWIO_INPUT_ERC20_AMOUNT_A = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWIO_INPUT_ERC20_TOKEN_B = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));
    const FLOWIO_INPUT_ERC20_AMOUNT_B = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));

    const FLOWIO_OUTPUT_ERC20_TOKEN_A = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 9));
    const FLOWIO_OUTPUT_ERC20_AMOUNT_A = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 10));
    const FLOWIO_OUTPUT_ERC20_TOKEN_B = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 11));
    const FLOWIO_OUTPUT_ERC20_AMOUNT_B = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 12));

    const sourceFlowIO = concat([
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      FLOWIO_OUTPUT_ERC20_TOKEN_A(),
      FLOWIO_OUTPUT_ERC20_AMOUNT_A(),
      FLOWIO_OUTPUT_ERC20_TOKEN_B(),
      FLOWIO_OUTPUT_ERC20_AMOUNT_B(),
      SENTINEL(),
      FLOWIO_INPUT_ERC20_TOKEN_A(),
      FLOWIO_INPUT_ERC20_AMOUNT_A(),
      FLOWIO_INPUT_ERC20_TOKEN_B(),
      FLOWIO_INPUT_ERC20_AMOUNT_B(),
      FLOWIO_OUTPUT_NATIVE(),
      FLOWIO_INPUT_NATIVE(),
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [TRUE(), TRUE(), TRUE(), sourceFlowIO];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC1155Deploy(deployer, flowFactory, {
      uri: "F1155",
      vmStateConfig: stateConfigStruct,
    });

    const flowIOPreview = await flow.previewFlow(sources.length - 1, 1234);

    compareStructs(flowIOPreview, flowIO, true);
  });

  it("should preview defined flow IO for ERC1155 (single element arrays)", async () => {
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
      RAIN_FLOW_ERC1155_SENTINEL,
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
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const TRUE = () => op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWIO_INPUT_ERC1155_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWIO_INPUT_ERC1155_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWIO_INPUT_ERC1155_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));
    const FLOWIO_OUTPUT_ERC1155_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));
    const FLOWIO_OUTPUT_ERC1155_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 9));
    const FLOWIO_OUTPUT_ERC1155_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 10));

    const sourceFlowIO = concat([
      SENTINEL(),
      FLOWIO_OUTPUT_ERC1155_TOKEN(),
      FLOWIO_OUTPUT_ERC1155_ID(),
      FLOWIO_OUTPUT_ERC1155_AMOUNT(),
      SENTINEL(),
      FLOWIO_INPUT_ERC1155_TOKEN(),
      FLOWIO_INPUT_ERC1155_ID(),
      FLOWIO_INPUT_ERC1155_AMOUNT(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      FLOWIO_OUTPUT_NATIVE(),
      FLOWIO_INPUT_NATIVE(),
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [TRUE(), TRUE(), TRUE(), sourceFlowIO];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC1155Deploy(deployer, flowFactory, {
      uri: "F1155",
      vmStateConfig: stateConfigStruct,
    });

    const flowIOPreview = await flow.previewFlow(sources.length - 1, 1234);

    compareStructs(flowIOPreview, flowIO);
  });

  it("should preview defined flow IO for ERC721 (single element arrays)", async () => {
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
      RAIN_FLOW_ERC1155_SENTINEL,
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
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const TRUE = () => op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWIO_INPUT_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWIO_INPUT_ERC721_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWIO_OUTPUT_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));
    const FLOWIO_OUTPUT_ERC721_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));

    const sourceFlowIO = concat([
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      FLOWIO_OUTPUT_ERC721_TOKEN(),
      FLOWIO_OUTPUT_ERC721_ID(),
      SENTINEL(),
      FLOWIO_INPUT_ERC721_TOKEN(),
      FLOWIO_INPUT_ERC721_ID(),
      SENTINEL(),
      SENTINEL(),
      FLOWIO_OUTPUT_NATIVE(),
      FLOWIO_INPUT_NATIVE(),
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [TRUE(), TRUE(), TRUE(), sourceFlowIO];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC1155Deploy(deployer, flowFactory, {
      uri: "F1155",
      vmStateConfig: stateConfigStruct,
    });

    const flowIOPreview = await flow.previewFlow(sources.length - 1, 1234);

    compareStructs(flowIOPreview, flowIO);
  });

  it("should preview defined flow IO for ERC20 (single element arrays)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const erc20 = (await basicDeploy("ReserveToken", {})) as ReserveToken;
    await erc20.initialize();

    const flowIO: FlowIOStruct = {
      inputNative: 10,
      outputNative: 50,
      inputs20: [{ token: erc20.address, amount: 1 }],
      outputs20: [{ token: erc20.address, amount: 2 }],
      inputs721: [],
      outputs721: [],
      inputs1155: [],
      outputs1155: [],
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
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
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const TRUE = () => op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWIO_INPUT_ERC20_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWIO_INPUT_ERC20_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWIO_OUTPUT_ERC20_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));
    const FLOWIO_OUTPUT_ERC20_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));

    const sourceFlowIO = concat([
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      FLOWIO_OUTPUT_ERC20_TOKEN(),
      FLOWIO_OUTPUT_ERC20_AMOUNT(),
      SENTINEL(),
      FLOWIO_INPUT_ERC20_TOKEN(),
      FLOWIO_INPUT_ERC20_AMOUNT(),
      FLOWIO_OUTPUT_NATIVE(),
      FLOWIO_INPUT_NATIVE(),
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [TRUE(), TRUE(), TRUE(), sourceFlowIO];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC1155Deploy(deployer, flowFactory, {
      uri: "F1155",
      vmStateConfig: stateConfigStruct,
    });

    const flowIOPreview = await flow.previewFlow(sources.length - 1, 1234);

    compareStructs(flowIOPreview, flowIO);
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
      RAIN_FLOW_ERC1155_SENTINEL,
      0,
      flowIO.inputNative,
      flowIO.outputNative,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const TRUE = () => op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

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
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [TRUE(), TRUE(), TRUE(), sourceFlowIO];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC1155Deploy(deployer, flowFactory, {
      uri: "F1155",
      vmStateConfig: stateConfigStruct,
    });

    await assertError(
      async () => await flow.previewFlow(sources.length - 1, 1234),
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
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      flowIO.inputNative,
      flowIO.outputNative,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const TRUE = () => op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

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
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [TRUE(), TRUE(), TRUE(), sourceFlowIO];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC1155Deploy(deployer, flowFactory, {
      uri: "F1155",
      vmStateConfig: stateConfigStruct,
    });

    const flowIOPreview = await flow.previewFlow(sources.length - 1, 1234);

    compareStructs(flowIOPreview, flowIO);
  });
});
