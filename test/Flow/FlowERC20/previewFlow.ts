import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  FlowERC20Factory,
  FlowIntegrity,
  ReserveToken,
  ReserveTokenERC721,
} from "../../../typechain";
import { FlowIOStruct } from "../../../typechain/contracts/flow/Flow";
import { FlowERC20ConfigStruct } from "../../../typechain/contracts/flow/FlowERC20";
import { RAIN_FLOW_SENTINEL } from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basic";
import { flowERC20Deploy } from "../../../utils/deploy/flow/flow";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { memoryOperand, MemoryType, op } from "../../../utils/rainvm/vm";
import { assertError } from "../../../utils/test/assertError";
import { compareStructs } from "../../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe("FlowERC20 previewFlow tests", async function () {
  let integrity: FlowIntegrity;
  let flowFactory: FlowERC20Factory;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory("FlowIntegrity");
    integrity = (await integrityFactory.deploy()) as FlowIntegrity;
    await integrity.deployed();

    const flowFactoryFactory = await ethers.getContractFactory(
      "FlowERC20Factory",
      {}
    );
    flowFactory = (await flowFactoryFactory.deploy(
      integrity.address
    )) as FlowERC20Factory;
    await flowFactory.deployed();
  });

  // should preview defined flow IO for native Ether
  // should preview defined flow IO for ERC1155 (multi element arrays)
  // should preview defined flow IO for ERC721 (multi element arrays)
  // should preview defined flow IO for ERC1155 (single element arrays)

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
      1,
      1,
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
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWIO_INPUT_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWIO_INPUT_ERC721_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));
    const FLOWIO_OUTPUT_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));
    const FLOWIO_OUTPUT_ERC721_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 9));

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
    ]);

    const sources = [REBASE_RATIO(), CAN_TRANSFER(), CAN_FLOW(), sourceFlowIO];

    const configStruct: FlowERC20ConfigStruct = {
      name: "tokenERC20",
      symbol: "TKN",
      vmStateConfig: {
        sources,
        constants,
      },
    };

    const flow = await flowERC20Deploy(deployer, flowFactory, configStruct);

    const flowIOPreview = await flow.previewFlow(3, 1234);

    compareStructs(flowIOPreview, flowIO);
  });

  it("should preview defined flow IO for ERC20 (multi element arrays)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const erc20A = (await basicDeploy("ReserveToken", {})) as ReserveToken;
    await erc20A.initialize();
    const erc20B = (await basicDeploy("ReserveToken", {})) as ReserveToken;
    await erc20B.initialize();

    const flowIO: FlowIOStruct = {
      inputNative: 0,
      outputNative: 0,
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
      1,
      1,
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
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));

    const FLOWIO_INPUT_ERC20_TOKEN_A = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWIO_INPUT_ERC20_AMOUNT_A = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));
    const FLOWIO_INPUT_ERC20_TOKEN_B = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));
    const FLOWIO_INPUT_ERC20_AMOUNT_B = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 9));

    const FLOWIO_OUTPUT_ERC20_TOKEN_A = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 10));
    const FLOWIO_OUTPUT_ERC20_AMOUNT_A = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 11));
    const FLOWIO_OUTPUT_ERC20_TOKEN_B = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 12));
    const FLOWIO_OUTPUT_ERC20_AMOUNT_B = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 13));

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
    ]);

    const sources = [REBASE_RATIO(), CAN_TRANSFER(), CAN_FLOW(), sourceFlowIO];

    const configStruct: FlowERC20ConfigStruct = {
      name: "tokenERC20",
      symbol: "TKN",
      vmStateConfig: {
        sources,
        constants,
      },
    };

    const flow = await flowERC20Deploy(deployer, flowFactory, configStruct);

    const flowIOPreview = await flow.previewFlow(3, 1234);

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
      1,
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
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWIO_INPUT_ERC20_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWIO_INPUT_ERC20_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));
    const FLOWIO_OUTPUT_ERC20_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));
    const FLOWIO_OUTPUT_ERC20_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 9));

    // prettier-ignore
    const sourceRebaseRatio = concat([
      REBASE_RATIO(), // 1
    ]);

    // prettier-ignore
    const sourceCanTransfer = concat([
      CAN_TRANSFER(), // true
    ]);

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
      FLOWIO_OUTPUT_ERC20_TOKEN(),
      FLOWIO_OUTPUT_ERC20_AMOUNT(),
      SENTINEL(),
      FLOWIO_INPUT_ERC20_TOKEN(),
      FLOWIO_INPUT_ERC20_AMOUNT(),
      FLOWIO_OUTPUT_NATIVE(),
      FLOWIO_INPUT_NATIVE(),
    ]);

    const sources = [
      sourceRebaseRatio,
      sourceCanTransfer,
      sourceCanFlow,
      sourceFlowIO,
    ];

    const configStruct: FlowERC20ConfigStruct = {
      name: "tokenERC20",
      symbol: "TKN",
      vmStateConfig: {
        sources,
        constants,
      },
    };

    const flow = await flowERC20Deploy(deployer, flowFactory, configStruct);

    const flowIOPreview = await flow.previewFlow(3, 1234);

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
      1,
      0,
      1,
      flowIO.inputNative,
      flowIO.outputNative,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));

    // prettier-ignore
    const sourceRebaseRatio = concat([
      REBASE_RATIO(), // 1
    ]);

    // prettier-ignore
    const sourceCanTransfer = concat([
      CAN_TRANSFER(), // true
    ]);

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

    const sources = [
      sourceRebaseRatio,
      sourceCanTransfer,
      sourceCanFlow,
      sourceFlowIO,
    ];

    const configStruct: FlowERC20ConfigStruct = {
      name: "tokenERC20",
      symbol: "TKN",
      vmStateConfig: {
        sources,
        constants,
      },
    };

    const flow = await flowERC20Deploy(deployer, flowFactory, configStruct);

    await assertError(
      async () => await flow.previewFlow(3, 1234),
      "CANT_FLOW",
      "flowed when it should not"
    );
  });
});
