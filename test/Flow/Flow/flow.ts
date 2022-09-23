import { assert } from "chai";
import { BigNumber } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  FlowFactory,
  FlowIntegrity,
  ReserveToken18,
  ReserveTokenERC1155,
  ReserveTokenERC721,
} from "../../../typechain";
import {
  FlowIOStruct,
  FlowIOStructOutput,
  StateConfigStruct,
} from "../../../typechain/contracts/flow/Flow";
import { eighteenZeros, sixZeros } from "../../../utils/constants/bigNumber";
import { RAIN_FLOW_SENTINEL } from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basic";
import { flowDeploy } from "../../../utils/deploy/flow/flow";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { memoryOperand, MemoryType, op } from "../../../utils/rainvm/vm";
import { compareStructs } from "../../../utils/test/compareStructs";
import { Struct } from "../../../utils/types";

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

  it("should flow for ERC1155<->ERC1155 on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const erc1155In = (await basicDeploy(
      "ReserveTokenERC1155",
      {}
    )) as ReserveTokenERC1155;
    await erc1155In.initialize();

    const erc1155Out = (await basicDeploy(
      "ReserveTokenERC1155",
      {}
    )) as ReserveTokenERC1155;
    await erc1155Out.initialize();

    const flowIO: FlowIOStruct = {
      inputNative: ethers.BigNumber.from(0),
      outputNative: ethers.BigNumber.from(0),
      inputs20: [],
      outputs20: [],
      inputs721: [],
      outputs721: [],
      inputs1155: [
        {
          token: erc1155In.address,
          id: 0,
          amount: ethers.BigNumber.from(1 + sixZeros),
        },
      ],
      outputs1155: [
        {
          token: erc1155Out.address,
          id: 0,
          amount: ethers.BigNumber.from(2 + sixZeros),
        },
      ],
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
    ]);

    const stateConfigStructs: StateConfigStruct[] = [
      {
        sources: [CAN_FLOW(), sourceFlowIO],
        constants,
      },
    ];

    const flow = await flowDeploy(deployer, flowFactory, stateConfigStructs);

    const you = signers[1];
    const me = flow;

    // Ensure parties hold ERC1155 tokens
    await erc1155In.mintNewToken();
    await erc1155Out.mintNewToken();

    await erc1155In.safeTransferFrom(
      signers[0].address,
      you.address,
      flowIO.inputs1155[0].id,
      flowIO.inputs1155[0].amount,
      new Uint8Array()
    );

    await erc1155Out.safeTransferFrom(
      signers[0].address,
      me.address,
      flowIO.outputs1155[0].id,
      flowIO.outputs1155[0].amount,
      new Uint8Array()
    );

    await erc1155In.connect(you).setApprovalForAll(me.address, true);

    const flowStruct = await flow.connect(you).callStatic.flow(1, 1234);

    compareStructs(flowStruct, flowIO);

    const _txFlow = await flow.connect(you).flow(1, 1234);

    const meBalanceIn = await erc1155In.balanceOf(me.address, 0);
    const meBalanceOut = await erc1155Out.balanceOf(me.address, 0);
    const youBalanceIn = await erc1155In.balanceOf(you.address, 0);
    const youBalanceOut = await erc1155Out.balanceOf(you.address, 0);

    assert(
      meBalanceIn.eq(flowStruct.inputs1155[0].amount),
      `wrong balance for me (flow contract)
      expected  ${flowStruct.inputs1155[0].amount}
      got       ${meBalanceIn}`
    );

    assert(
      meBalanceOut.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${meBalanceOut}`
    );

    assert(
      youBalanceIn.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${youBalanceIn}`
    );

    assert(
      youBalanceOut.eq(flowStruct.outputs1155[0].amount),
      `wrong balance for you (signer1 contract)
      expected  ${flowStruct.outputs1155[0].amount}
      got       ${youBalanceOut}`
    );
  });

  it("should flow for ERC721<->ERC721 on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const erc721In = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721In.initialize();

    const erc721Out = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721Out.initialize();

    const flowIO: FlowIOStruct = {
      inputNative: ethers.BigNumber.from(0),
      outputNative: ethers.BigNumber.from(0),
      inputs20: [],
      outputs20: [],
      inputs721: [
        {
          token: erc721In.address,
          id: 0,
        },
      ],
      outputs721: [
        {
          token: erc721Out.address,
          id: 0,
        },
      ],
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

    const stateConfigStructs: StateConfigStruct[] = [
      {
        sources: [CAN_FLOW(), sourceFlowIO],
        constants,
      },
    ];

    const flow = await flowDeploy(deployer, flowFactory, stateConfigStructs);

    const you = signers[1];
    const me = flow;

    // Ensure parties hold ERC721 tokens
    await erc721In.mintNewToken();
    await erc721Out.mintNewToken();

    await erc721In.transferFrom(
      signers[0].address,
      you.address,
      flowIO.inputs721[0].id
    );
    await erc721Out.transferFrom(
      signers[0].address,
      me.address,
      flowIO.outputs721[0].id
    );

    await erc721In.connect(you).approve(me.address, flowIO.inputs721[0].id);

    const flowStruct = await flow.connect(you).callStatic.flow(1, 1234);

    compareStructs(flowStruct, flowIO);

    const _txFlow = await flow.connect(you).flow(1, 1234);

    const meBalanceIn = await erc721In.balanceOf(me.address);
    const meBalanceOut = await erc721Out.balanceOf(me.address);
    const youBalanceIn = await erc721In.balanceOf(you.address);
    const youBalanceOut = await erc721Out.balanceOf(you.address);

    assert(
      meBalanceIn.eq(BigNumber.from(1)),
      `wrong balance for me (flow contract)
      expected  ${BigNumber.from(1)}
      got       ${meBalanceIn}`
    );

    assert(
      meBalanceOut.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${meBalanceOut}`
    );

    assert(
      youBalanceIn.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${youBalanceIn}`
    );

    assert(
      youBalanceOut.eq(BigNumber.from(1)),
      `wrong balance for you (signer1 contract)
      expected  ${BigNumber.from(1)}
      got       ${youBalanceOut}`
    );
  });

  it("should flow for ERC20<->ERC20 on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const erc20In = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await erc20In.initialize();

    const erc20Out = (await basicDeploy(
      "ReserveToken18",
      {}
    )) as ReserveToken18;
    await erc20Out.initialize();

    const flowIO: FlowIOStruct = {
      inputNative: ethers.BigNumber.from(0),
      outputNative: ethers.BigNumber.from(0),
      inputs20: [
        {
          token: erc20In.address,
          amount: ethers.BigNumber.from(1 + eighteenZeros),
        },
      ],
      outputs20: [
        {
          token: erc20Out.address,
          amount: ethers.BigNumber.from(2 + eighteenZeros),
        },
      ],
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

    const stateConfigStructs: StateConfigStruct[] = [
      {
        sources: [CAN_FLOW(), sourceFlowIO],
        constants,
      },
    ];

    const flow = await flowDeploy(deployer, flowFactory, stateConfigStructs);

    const you = signers[1];
    const me = flow;

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowIO.inputs20[0].amount);
    await erc20Out.transfer(me.address, flowIO.outputs20[0].amount);

    await erc20In.connect(you).approve(me.address, flowIO.inputs20[0].amount);

    const flowStruct = await flow.connect(you).callStatic.flow(1, 1234);

    compareStructs(flowStruct, flowIO);

    const _txFlow = await flow.connect(you).flow(1, 1234);

    const meBalanceIn = await erc20In.balanceOf(me.address);
    const meBalanceOut = await erc20Out.balanceOf(me.address);
    const youBalanceIn = await erc20In.balanceOf(you.address);
    const youBalanceOut = await erc20Out.balanceOf(you.address);

    assert(
      meBalanceIn.eq(flowStruct.inputs20[0].amount),
      `wrong balance for me (flow contract)
      expected  ${flowStruct.inputs20[0].amount}
      got       ${meBalanceIn}`
    );

    assert(
      meBalanceOut.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${meBalanceOut}`
    );

    assert(
      youBalanceIn.eq(BigNumber.from(0)),
      `wrong balance for me (flow contract)
      expected  ${0}
      got       ${youBalanceIn}`
    );

    assert(
      youBalanceOut.eq(flowStruct.outputs20[0].amount),
      `wrong balance for you (signer1 contract)
      expected  ${flowStruct.outputs20[0].amount}
      got       ${youBalanceOut}`
    );
  });

  it("should flow for native<->native on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const flowIO: Struct<FlowIOStructOutput> = {
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
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
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

    const stateConfigStructs: StateConfigStruct[] = [
      {
        sources: [CAN_FLOW(), sourceFlowIO],
        constants,
      },
    ];

    const flow = await flowDeploy(deployer, flowFactory, stateConfigStructs);

    const you = signers[1];
    const me = flow;

    // Ensure Flow contract holds enough Ether
    await signers[0].sendTransaction({
      to: me.address,
      value: ethers.BigNumber.from(flowIO.outputNative),
    });

    const youBalance0 = await ethers.provider.getBalance(you.address);
    const meBalance0 = await ethers.provider.getBalance(me.address);

    assert(meBalance0.eq(flowIO.outputNative));

    const flowStruct = await flow.connect(you).callStatic.flow(1, 1234, {
      value: ethers.BigNumber.from(flowIO.inputNative),
    });

    compareStructs(flowStruct, flowIO);

    const txFlow = await flow
      .connect(you)
      .flow(1, 1234, { value: ethers.BigNumber.from(flowIO.inputNative) });

    const { gasUsed } = await txFlow.wait();
    const { gasPrice } = txFlow;

    const youBalance1 = await ethers.provider.getBalance(you.address);
    const meBalance1 = await ethers.provider.getBalance(me.address);

    const expectedYouBalance1 = youBalance0
      .sub(flowIO.inputNative)
      .add(flowIO.outputNative)
      .sub(gasUsed.mul(gasPrice));

    assert(
      youBalance1.eq(expectedYouBalance1),
      `wrong balance for you (signer1)
      expected  ${expectedYouBalance1}
      got       ${youBalance1}`
    );

    const expectedMeBalance1 = meBalance0
      .add(flowIO.inputNative)
      .sub(flowIO.outputNative);

    assert(
      meBalance1.eq(expectedMeBalance1),
      `wrong balance for me (flow contract)
      expected  ${expectedMeBalance1}
      got       ${meBalance1}`
    );
  });

  it("should receive Ether", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const flowIO: Struct<FlowIOStructOutput> = {
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
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
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

    const stateConfigStructs: StateConfigStruct[] = [
      {
        sources: [CAN_FLOW(), sourceFlowIO],
        constants,
      },
    ];

    const flow = await flowDeploy(deployer, flowFactory, stateConfigStructs);

    await signers[0].sendTransaction({
      to: flow.address,
      value: ethers.BigNumber.from(flowIO.outputNative),
    });
  });
});
