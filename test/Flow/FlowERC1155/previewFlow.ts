import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  FlowERC1155Factory,
  ReserveToken,
  ReserveTokenERC1155,
  ReserveTokenERC721,
} from "../../../typechain";
import {
  FlowERC1155IOStruct,
  FlowTransferStruct,
  ExpressionConfigStruct,
} from "../../../typechain/contracts/flow/erc1155/FlowERC1155";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import { sixZeros } from "../../../utils/constants/bigNumber";
import {
  RAIN_FLOW_ERC1155_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { flowERC1155Deploy } from "../../../utils/deploy/flow/flowERC1155/deploy";
import { flowERC1155FactoryDeploy } from "../../../utils/deploy/flow/flowERC1155/flowERC1155Factory/deploy";
import { getEvents } from "../../../utils/events";
import { fillEmptyAddressERC1155 } from "../../../utils/flow";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../utils/test/assertError";
import { compareStructs } from "../../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe("FlowERC1155 previewFlow tests", async function () {
  let flowERC1155Factory: FlowERC1155Factory;
  const ME = () => op(Opcode.context, 0x0001); // base context this
  const YOU = () => op(Opcode.context, 0x0000); // base context sender

  before(async () => {
    flowERC1155Factory = await flowERC1155FactoryDeploy();
  });

  it("should preview defined flow IO for native Ether", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const flowTransfer: FlowTransferStruct = {
      native: [
        {
          from: you.address,
          to: "", // Contract Address
          amount: ethers.BigNumber.from(1 + sixZeros),
        },
        {
          from: "", // Contract Address
          to: you.address,
          amount: ethers.BigNumber.from(2 + sixZeros),
        },
      ],
      erc20: [],
      erc721: [],
      erc1155: [],
    };

    const flowERC1155IO: FlowERC1155IOStruct = {
      mints: [],
      burns: [],
      flow: flowTransfer,
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      flowTransfer.native[0].amount,
      flowTransfer.native[1].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));

    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 4));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE END
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT(),
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [CAN_TRANSFER()];

    const expressionConfigStruct: ExpressionConfigStruct = {
      sources,
      constants,
    };

    const { flow } = await flowERC1155Deploy(deployer, flowERC1155Factory, {
      uri: "F1155",
      expressionConfig: expressionConfigStruct,
      flows: [
        {
          sources: [sourceFlowIO],
          constants,
        },
      ],
    });

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const flowTransferPreview = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowTransferPreview,
      fillEmptyAddressERC1155(flowERC1155IO, flow.address),
      true
    );
  });

  it("should preview defined flow IO for ERC1155 (multi element arrays)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

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

    const flowTransfer: FlowTransferStruct = {
      native: [],
      erc20: [],
      erc721: [],
      erc1155: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc1155A.address,
          id: 1,
          amount: 2,
        },
        {
          from: you.address,
          to: "", // Contract address
          token: erc1155B.address,
          id: 3,
          amount: 4,
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc1155A.address,
          id: 5,
          amount: 6,
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc1155B.address,
          id: 7,
          amount: 8,
        },
      ],
    };
    const flowERC1155IO: FlowERC1155IOStruct = {
      mints: [],
      burns: [],
      flow: flowTransfer,
    };
    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      flowTransfer.erc1155[0].token,
      flowTransfer.erc1155[0].id,
      flowTransfer.erc1155[0].amount,
      flowTransfer.erc1155[1].token,
      flowTransfer.erc1155[1].id,
      flowTransfer.erc1155[1].amount,
      flowTransfer.erc1155[2].token,
      flowTransfer.erc1155[2].id,
      flowTransfer.erc1155[2].amount,
      flowTransfer.erc1155[3].token,
      flowTransfer.erc1155[3].id,
      flowTransfer.erc1155[3].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));

    const FLOWTRANSFER_YOU_TO_ME_ERC1155_TOKEN_A = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_ID_A = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_AMOUNT_A = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_TOKEN_B = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_ID_B = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 7));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_AMOUNT_B = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 8));

    const FLOWTRANSFER_ME_TO_YOU_ERC1155_TOKEN_A = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 9));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_ID_A = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 10));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_AMOUNT_A = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 11));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_TOKEN_B = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 12));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_ID_B = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 13));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_AMOUNT_B = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 14));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 END
      FLOWTRANSFER_YOU_TO_ME_ERC1155_TOKEN_A(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC1155_ID_A(),
      FLOWTRANSFER_YOU_TO_ME_ERC1155_AMOUNT_A(),
      FLOWTRANSFER_YOU_TO_ME_ERC1155_TOKEN_B(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC1155_ID_B(),
      FLOWTRANSFER_YOU_TO_ME_ERC1155_AMOUNT_B(),
      FLOWTRANSFER_ME_TO_YOU_ERC1155_TOKEN_A(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_ERC1155_ID_A(),
      FLOWTRANSFER_ME_TO_YOU_ERC1155_AMOUNT_A(),
      FLOWTRANSFER_ME_TO_YOU_ERC1155_TOKEN_B(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_ERC1155_ID_B(),
      FLOWTRANSFER_ME_TO_YOU_ERC1155_AMOUNT_B(),
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE SKIP
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [CAN_TRANSFER()];

    const expressionConfigStruct: ExpressionConfigStruct = {
      sources,
      constants,
    };

    const { flow } = await flowERC1155Deploy(deployer, flowERC1155Factory, {
      uri: "F1155",
      expressionConfig: expressionConfigStruct,
      flows: [
        {
          sources: [sourceFlowIO],
          constants,
        },
      ],
    });

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const flowTransferPreview = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowTransferPreview,
      fillEmptyAddressERC1155(flowERC1155IO, flow.address),
      true
    );
  });

  it("should preview defined flow IO for ERC721 (multi element arrays)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

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

    const flowTransfer: FlowTransferStruct = {
      native: [],
      erc20: [],
      erc721: [
        {
          token: erc721A.address,
          from: you.address,
          to: "", // Contract Address
          id: 1,
        },
        {
          token: erc721B.address,
          from: you.address,
          to: "", // Contract Address
          id: 2,
        },
        {
          token: erc721A.address,
          from: "", // Contract Address
          to: you.address,
          id: 3,
        },
        {
          token: erc721B.address,
          from: "", // Contract Address
          to: you.address,
          id: 4,
        },
      ],
      erc1155: [],
    };

    const flowERC1155IO: FlowERC1155IOStruct = {
      mints: [],
      burns: [],
      flow: flowTransfer,
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      flowTransfer.erc721[0].token,
      flowTransfer.erc721[0].id,
      flowTransfer.erc721[1].token,
      flowTransfer.erc721[1].id,
      flowTransfer.erc721[2].token,
      flowTransfer.erc721[2].id,
      flowTransfer.erc721[3].token,
      flowTransfer.erc721[3].id,
    ];

    const SENTINEL = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));

    const FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN_A = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_YOU_TO_ME_ERC721_ID_A = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN_B = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_YOU_TO_ME_ERC721_ID_B = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 6));

    const FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN_A = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 7));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_ID_A = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 8));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN_B = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 9));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_ID_B = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 10));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 END
      FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN_A(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC721_ID_A(),
      FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN_B(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC721_ID_B(),
      FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN_A(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_ERC721_ID_A(),
      FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN_B(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_ERC721_ID_B(),
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE SKIP
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [CAN_TRANSFER()];

    const expressionConfigStruct: ExpressionConfigStruct = {
      sources,
      constants,
    };

    const { flow } = await flowERC1155Deploy(deployer, flowERC1155Factory, {
      uri: "F1155",
      expressionConfig: expressionConfigStruct,
      flows: [
        {
          sources: [sourceFlowIO],
          constants,
        },
      ],
    });

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const flowTransferPreview = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowTransferPreview,
      fillEmptyAddressERC1155(flowERC1155IO, flow.address),
      true
    );
  });

  it("should preview defined flow IO for ERC20 (multi element arrays)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const erc20A = (await basicDeploy("ReserveToken", {})) as ReserveToken;
    await erc20A.initialize();
    const erc20B = (await basicDeploy("ReserveToken", {})) as ReserveToken;
    await erc20B.initialize();
    const flowTransfer: FlowTransferStruct = {
      native: [
        {
          from: you.address,
          to: "", // Contract Address
          amount: 10,
        },
        {
          from: "", // Contract Address
          to: you.address,
          amount: 50,
        },
      ],
      erc20: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc20A.address,
          amount: 1,
        },
        {
          from: you.address,
          to: "", // Contract address
          token: erc20B.address,
          amount: 2,
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc20A.address,
          amount: 3,
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc20B.address,
          amount: 4,
        },
      ],
      erc721: [],
      erc1155: [],
    };

    const flowERC1155IO: FlowERC1155IOStruct = {
      mints: [],
      burns: [],
      flow: flowTransfer,
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      flowTransfer.native[0].amount,
      flowTransfer.native[1].amount,
      flowTransfer.erc20[0].token,
      flowTransfer.erc20[0].amount,
      flowTransfer.erc20[1].token,
      flowTransfer.erc20[1].amount,
      flowTransfer.erc20[2].token,
      flowTransfer.erc20[2].amount,
      flowTransfer.erc20[3].token,
      flowTransfer.erc20[3].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));

    const CAN_TRANSFER = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));

    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN_A = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT_A = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN_B = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 7));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT_B = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 8));

    const FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN_A = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 9));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT_A = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 10));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN_B = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 11));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT_B = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 12));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 END
      FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN_A(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT_A(),
      FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN_B(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT_B(),
      FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN_A(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT_A(),
      FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN_B(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT_B(),
      SENTINEL(), // NATIVE END
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT(),
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [CAN_TRANSFER()];

    const expressionConfigStruct: ExpressionConfigStruct = {
      sources,
      constants,
    };

    const { flow } = await flowERC1155Deploy(deployer, flowERC1155Factory, {
      uri: "F1155",
      expressionConfig: expressionConfigStruct,
      flows: [
        {
          sources: [sourceFlowIO],
          constants,
        },
      ],
    });

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const flowTransferPreview = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowTransferPreview,
      fillEmptyAddressERC1155(flowERC1155IO, flow.address),
      true
    );
  });

  it("should preview defined flow IO for ERC1155 (single element arrays)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const erc1155 = (await basicDeploy(
      "ReserveTokenERC1155",
      {}
    )) as ReserveTokenERC1155;
    await erc1155.initialize();

    const flowTransfer: FlowTransferStruct = {
      native: [],
      erc20: [],
      erc721: [],
      erc1155: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc1155.address,
          id: 1,
          amount: 2,
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc1155.address,
          id: 3,
          amount: 4,
        },
      ],
    };

    const flowERC1155IO: FlowERC1155IOStruct = {
      mints: [],
      burns: [],
      flow: flowTransfer,
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      flowTransfer.erc1155[0].token,
      flowTransfer.erc1155[0].id,
      flowTransfer.erc1155[0].amount,
      flowTransfer.erc1155[1].token,
      flowTransfer.erc1155[1].id,
      flowTransfer.erc1155[1].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));

    const FLOWTRANSFER_YOU_TO_ME_ERC1155_TOKEN = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_ID = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_AMOUNT = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_TOKEN = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_ID = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 7));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_AMOUNT = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 8));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 END
      FLOWTRANSFER_YOU_TO_ME_ERC1155_TOKEN(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC1155_ID(),
      FLOWTRANSFER_YOU_TO_ME_ERC1155_AMOUNT(),
      FLOWTRANSFER_ME_TO_YOU_ERC1155_TOKEN(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_ERC1155_ID(),
      FLOWTRANSFER_ME_TO_YOU_ERC1155_AMOUNT(),
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE SKIP
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [CAN_TRANSFER()];

    const expressionConfigStruct: ExpressionConfigStruct = {
      sources,
      constants,
    };

    const { flow } = await flowERC1155Deploy(deployer, flowERC1155Factory, {
      uri: "F1155",
      expressionConfig: expressionConfigStruct,
      flows: [
        {
          sources: [sourceFlowIO],
          constants,
        },
      ],
    });

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const flowTransferPreview = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowTransferPreview,
      fillEmptyAddressERC1155(flowERC1155IO, flow.address)
    );
  });

  it("should preview defined flow IO for ERC721 (single element arrays)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const erc721 = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721.initialize();

    const flowTransfer: FlowTransferStruct = {
      native: [],
      erc20: [],
      erc721: [
        {
          token: erc721.address,
          from: you.address,
          to: "", // Contract Address
          id: 1,
        },
        {
          token: erc721.address,
          from: "", // Contract Address
          to: you.address,
          id: 2,
        },
      ],
      erc1155: [],
    };

    const flowERC1155IO: FlowERC1155IOStruct = {
      mints: [],
      burns: [],
      flow: flowTransfer,
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      flowTransfer.erc721[0].token,
      flowTransfer.erc721[0].id,
      flowTransfer.erc721[1].token,
      flowTransfer.erc721[1].id,
    ];

    const SENTINEL = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));

    const FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_YOU_TO_ME_ERC721_ID = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_ID = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 6));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 END
      FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC721_ID(),
      FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_ERC721_ID(),
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE SKIP
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [CAN_TRANSFER()];

    const expressionConfigStruct: ExpressionConfigStruct = {
      sources,
      constants,
    };

    const { flow } = await flowERC1155Deploy(deployer, flowERC1155Factory, {
      uri: "F1155",
      expressionConfig: expressionConfigStruct,
      flows: [
        {
          sources: [sourceFlowIO],
          constants,
        },
      ],
    });

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const flowTransferPreview = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowTransferPreview,
      fillEmptyAddressERC1155(flowERC1155IO, flow.address)
    );
  });

  it("should preview defined flow IO for ERC20 (single element arrays)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const erc20 = (await basicDeploy("ReserveToken", {})) as ReserveToken;
    await erc20.initialize();

    const flowTransfer: FlowTransferStruct = {
      native: [
        {
          from: you.address,
          to: "", // Contract Address
          amount: 10,
        },
        {
          from: "", // Contract Address
          to: you.address,
          amount: 50,
        },
      ],
      erc20: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc20.address,
          amount: 1,
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc20.address,
          amount: 3,
        },
      ],
      erc721: [],
      erc1155: [],
    };

    const flowERC1155IO: FlowERC1155IOStruct = {
      mints: [],
      burns: [],
      flow: flowTransfer,
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      flowTransfer.native[0].amount,
      flowTransfer.native[1].amount,
      flowTransfer.erc20[0].token,
      flowTransfer.erc20[0].amount,
      flowTransfer.erc20[1].token,
      flowTransfer.erc20[1].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));

    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 7));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 8));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 END
      FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT(),
      FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT(),
      SENTINEL(), // NATIVE END
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT(),
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [CAN_TRANSFER()];

    const expressionConfigStruct: ExpressionConfigStruct = {
      sources,
      constants,
    };

    const { flow } = await flowERC1155Deploy(deployer, flowERC1155Factory, {
      uri: "F1155",
      expressionConfig: expressionConfigStruct,
      flows: [
        {
          sources: [sourceFlowIO],
          constants,
        },
      ],
    });

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const flowTransferPreview = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowTransferPreview,
      fillEmptyAddressERC1155(flowERC1155IO, flow.address)
    );
  });

  it("should not flow if it does not meet 'ensure' requirement", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const constants = [RAIN_FLOW_SENTINEL, RAIN_FLOW_ERC1155_SENTINEL, 0, 1];

    const SENTINEL = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const CAN_FLOW = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));
    const CAN_TRANSFER = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 3));

    // prettier-ignore
    const sourceFlowIO = concat([
      CAN_FLOW(),
      op(Opcode.ensure, 1),
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE SKIP
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [CAN_TRANSFER()];

    const expressionConfigStruct: ExpressionConfigStruct = {
      sources,
      constants,
    };

    const { flow } = await flowERC1155Deploy(deployer, flowERC1155Factory, {
      uri: "F1155",
      expressionConfig: expressionConfigStruct,
      flows: [
        {
          sources: [sourceFlowIO],
          constants,
        },
      ],
    });

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    await assertError(
      async () =>
        await flow.previewFlow(flowInitialized[0].evaluable, [1234], []),
      "",
      "flowed when it should not"
    );
  });

  it("should preview empty flow io", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const flowTransfer: FlowTransferStruct = {
      native: [],
      erc20: [],
      erc721: [],
      erc1155: [],
    };

    const flowERC1155IO: FlowERC1155IOStruct = {
      mints: [],
      burns: [],
      flow: flowTransfer,
    };

    const constants = [RAIN_FLOW_SENTINEL, RAIN_FLOW_ERC1155_SENTINEL, 1];

    const SENTINEL = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));

    // prettier-ignore
    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE SKIP
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [CAN_TRANSFER()];

    const expressionConfigStruct: ExpressionConfigStruct = {
      sources,
      constants,
    };

    const { flow } = await flowERC1155Deploy(deployer, flowERC1155Factory, {
      uri: "F1155",
      expressionConfig: expressionConfigStruct,
      flows: [
        {
          sources: [sourceFlowIO],
          constants,
        },
      ],
    });

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const flowTransferPreview = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(
      flowTransferPreview,
      fillEmptyAddressERC1155(flowERC1155IO, flow.address)
    );
  });
});
