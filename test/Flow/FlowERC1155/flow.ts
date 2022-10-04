import { assert } from "chai";
import { BigNumber } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  FlowERC1155Factory,
  FlowIntegrity,
  ReserveToken18,
  ReserveTokenERC1155,
  ReserveTokenERC721,
} from "../../../typechain";
import {
  FlowERC1155ConfigStruct,
  FlowIOStruct,
  FlowIOStructOutput,
  SaveVMStateEvent,
  StateConfigStruct,
} from "../../../typechain/contracts/flow/erc1155/FlowERC1155";
import { eighteenZeros, sixZeros } from "../../../utils/constants/bigNumber";
import {
  RAIN_FLOW_ERC1155_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basic";
import { flowERC1155Deploy } from "../../../utils/deploy/flow/flow";
import { getEvents } from "../../../utils/events";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { memoryOperand, MemoryType, op } from "../../../utils/rainvm/vm";
import { assertError } from "../../../utils/test/assertError";
import { compareStructs } from "../../../utils/test/compareStructs";
import { Struct } from "../../../utils/types";

const Opcode = AllStandardOps;

describe("FlowERC1155 flow tests", async function () {
  let integrity: FlowIntegrity;
  let flowERC1155Factory: FlowERC1155Factory;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory("FlowIntegrity");
    integrity = (await integrityFactory.deploy()) as FlowIntegrity;
    await integrity.deployed();

    const flowERC1155FactoryFactory = await ethers.getContractFactory(
      "FlowERC1155Factory",
      {}
    );
    flowERC1155Factory = (await flowERC1155FactoryFactory.deploy(
      integrity.address
    )) as FlowERC1155Factory;
    await flowERC1155Factory.deployed();
  });

  it("should support transferPreflight hook", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const flowIO: FlowIOStruct = {
      inputNative: ethers.BigNumber.from(0),
      outputNative: ethers.BigNumber.from(0),
      inputs20: [],
      outputs20: [],
      inputs721: [],
      outputs721: [],
      inputs1155: [],
      outputs1155: [],
    };

    const tokenId = 0;
    const tokenAmount = ethers.BigNumber.from(5 + sixZeros);

    const constantsCanTransfer = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      tokenId,
      tokenAmount,
      flowIO.inputNative,
      flowIO.outputNative,
      1,
      1,
    ];
    const constantsCannotTransfer = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      tokenId,
      tokenAmount,
      flowIO.inputNative,
      flowIO.outputNative,
      0,
      1,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const TOKEN_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const TOKEN_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));

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
      TOKEN_AMOUNT(),
      TOKEN_ID(),
    ]);

    const sources = [REBASE_RATIO(), CAN_TRANSFER()];

    const stateConfigStructCanTransfer: FlowERC1155ConfigStruct = {
      uri: "F1155",
      vmStateConfig: {
        sources,
        constants: constantsCanTransfer,
      },
      flows: [
        {
          sources: [CAN_FLOW(), sourceFlowIO],
          constants: constantsCanTransfer,
        },
      ],
    };
    const stateConfigStructCannotTransfer: FlowERC1155ConfigStruct = {
      uri: "F1155",
      vmStateConfig: {
        sources,
        constants: constantsCannotTransfer,
      },
      flows: [
        {
          sources: [CAN_FLOW(), sourceFlowIO],
          constants: constantsCannotTransfer,
        },
      ],
    };

    const flowCanTransfer = await flowERC1155Deploy(
      deployer,
      flowERC1155Factory,
      stateConfigStructCanTransfer
    );
    const flowCannotTransfer = await flowERC1155Deploy(
      deployer,
      flowERC1155Factory,
      stateConfigStructCannotTransfer
    );

    const flowStatesCanTransfer = (await getEvents(
      flowCanTransfer.deployTransaction,
      "SaveVMState",
      flowCanTransfer
    )) as SaveVMStateEvent["args"][];
    const flowStatesCannotTransfer = (await getEvents(
      flowCannotTransfer.deployTransaction,
      "SaveVMState",
      flowCannotTransfer
    )) as SaveVMStateEvent["args"][];

    const signer1 = signers[1];
    const signerReceiver = signers[2];

    const _txFlowCanTransfer = await flowCanTransfer
      .connect(signer1)
      .flow(flowStatesCanTransfer[1].id, 1234);

    const _txFlowCannotTransfer = await flowCannotTransfer
      .connect(signer1)
      .flow(flowStatesCannotTransfer[1].id, 1234);

    // check minting worked
    const balanceCan0 = await flowCanTransfer.balanceOf(
      signer1.address,
      tokenId
    );
    const balanceCannot0 = await flowCannotTransfer.balanceOf(
      signer1.address,
      tokenId
    );

    console.log({ balanceCan0, balanceCannot0 });

    assert(balanceCan0.eq(tokenAmount));
    assert(balanceCannot0.eq(tokenAmount));

    await flowCanTransfer
      .connect(signer1)
      .safeTransferFrom(
        signer1.address,
        signerReceiver.address,
        tokenId,
        tokenAmount,
        []
      );

    await assertError(
      async () =>
        await flowCannotTransfer
          .connect(signer1)
          .safeTransferFrom(
            signer1.address,
            signerReceiver.address,
            tokenId,
            tokenAmount,
            []
          ),
      "INVALID_TRANSFER",
      "transferred when it should not"
    );
  });

  it("should mint and burn tokens per flow in exchange for another token (e.g. native)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const flowIOMint: FlowIOStruct = {
      inputNative: ethers.BigNumber.from(2 + sixZeros),
      outputNative: ethers.BigNumber.from(0),
      inputs20: [],
      outputs20: [],
      inputs721: [],
      outputs721: [],
      inputs1155: [],
      outputs1155: [],
    };
    const flowIOBurn: FlowIOStruct = {
      inputNative: ethers.BigNumber.from(0),
      outputNative: ethers.BigNumber.from(2 + sixZeros),
      inputs20: [],
      outputs20: [],
      inputs721: [],
      outputs721: [],
      inputs1155: [],
      outputs1155: [],
    };

    // for mint flow (redeem native for erc20)
    const tokenId = 0;
    const tokenAmount = ethers.BigNumber.from(5 + sixZeros);

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      tokenId,
      tokenAmount,
      flowIOMint.inputNative,
      flowIOMint.outputNative,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const TOKEN_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const TOKEN_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));

    const sourceFlowIOMint = concat([
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
      TOKEN_AMOUNT(), // mint
      TOKEN_ID(), // mint
    ]);
    const sourceFlowIOBurn = concat([
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      FLOWIO_OUTPUT_NATIVE(),
      FLOWIO_INPUT_NATIVE(),
      SENTINEL_1155(),
      TOKEN_AMOUNT(), // burn
      TOKEN_ID(), // burn
      SENTINEL_1155(),
    ]);

    const sources = [REBASE_RATIO(), CAN_TRANSFER()];

    const stateConfigStruct: FlowERC1155ConfigStruct = {
      uri: "F1155",
      vmStateConfig: {
        sources,
        constants,
      },
      flows: [
        { sources: [CAN_FLOW(), sourceFlowIOMint], constants },
        { sources: [CAN_FLOW(), sourceFlowIOBurn], constants },
      ],
    };

    const flow = await flowERC1155Deploy(
      deployer,
      flowERC1155Factory,
      stateConfigStruct
    );

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

    const mintFlowId = flowStates[1].id;
    const burnFlowId = flowStates[2].id;

    const you = signers[1];
    const me = flow;

    // prepare input Ether
    const youEtherBalance0 = await ethers.provider.getBalance(you.address);

    // -- PERFORM MINT --

    const flowStructMint = await flow
      .connect(you)
      .callStatic.flow(mintFlowId, 1234, {
        value: ethers.BigNumber.from(flowIOMint.inputNative),
      });

    compareStructs(flowStructMint, flowIOMint);

    const txFlowMint = await flow.connect(you).flow(mintFlowId, 1234, {
      value: ethers.BigNumber.from(flowIOMint.inputNative),
    });

    // check input Ether affected balances correctly

    const { gasUsed } = await txFlowMint.wait();
    const { gasPrice } = txFlowMint;

    const youEtherBalance1 = await ethers.provider.getBalance(you.address);
    const meEtherBalance1 = await ethers.provider.getBalance(me.address);

    const expectedYouEtherBalance1 = youEtherBalance0
      .sub(flowIOMint.inputNative as BigNumber)
      .sub(gasUsed.mul(gasPrice));

    assert(
      youEtherBalance1.eq(expectedYouEtherBalance1),
      `wrong balance for you (signer1)
      expected  ${expectedYouEtherBalance1}
      got       ${youEtherBalance1}`
    );

    const expectedMeEtherBalance1 = flowIOMint.inputNative as BigNumber;

    assert(
      meEtherBalance1.eq(expectedMeEtherBalance1),
      `wrong balance for me (flow contract)
      expected  ${expectedMeEtherBalance1}
      got       ${meEtherBalance1}`
    );

    const me20Balance1 = await flow.balanceOf(me.address, tokenId);
    const you20Balance1 = await flow.balanceOf(you.address, tokenId);

    assert(me20Balance1.isZero());
    assert(you20Balance1.eq(tokenAmount));

    // -- PERFORM BURN --

    const flowStructBurn = await flow
      .connect(you)
      .callStatic.flow(burnFlowId, 1234);

    compareStructs(flowStructBurn, flowIOBurn);

    const txFlowBurn = await flow.connect(you).flow(burnFlowId, 1234);

    const { gasUsed: gasUsedBurn } = await txFlowBurn.wait();
    const { gasPrice: gasPriceBurn } = txFlowBurn;

    const youEtherBalance2 = await ethers.provider.getBalance(you.address);
    const meEtherBalance2 = await ethers.provider.getBalance(me.address);

    const expectedYouEtherBalance2 = youEtherBalance1
      .add(flowIOBurn.outputNative as BigNumber)
      .sub(gasUsedBurn.mul(gasPriceBurn));

    assert(
      youEtherBalance2.eq(expectedYouEtherBalance2),
      `wrong balance for you (signer1)
      expected  ${expectedYouEtherBalance2}
      got       ${youEtherBalance2}`
    );

    assert(
      meEtherBalance2.isZero(),
      `wrong balance for me (flow contract)
      expected  0
      got       ${meEtherBalance2}`
    );

    const me20Balance2 = await flow.balanceOf(me.address, tokenId);
    const you20Balance2 = await flow.balanceOf(you.address, tokenId);

    assert(me20Balance2.isZero());
    assert(you20Balance2.isZero());
  });

  it("should flow for erc1155<->native on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const erc1155In = (await basicDeploy(
      "ReserveTokenERC1155",
      {}
    )) as ReserveTokenERC1155;
    await erc1155In.initialize();

    const flowIO: FlowIOStruct = {
      inputNative: ethers.BigNumber.from(0),
      outputNative: ethers.BigNumber.from(2 + sixZeros),
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
      outputs1155: [],
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
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
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

    const sourceFlowIO = concat([
      SENTINEL(),
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

    const sources = [REBASE_RATIO(), CAN_TRANSFER()];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC1155Deploy(deployer, flowERC1155Factory, {
      uri: "F1155",
      vmStateConfig: stateConfigStruct,
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    });

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

    const you = signers[1];
    const me = flow;

    // prepare output Ether

    await signers[0].sendTransaction({
      to: me.address,
      value: ethers.BigNumber.from(flowIO.outputNative),
    });

    // prepare input ERC1155

    await erc1155In.mintNewToken();

    await erc1155In.safeTransferFrom(
      signers[0].address,
      you.address,
      flowIO.inputs1155[0].id,
      flowIO.inputs1155[0].amount,
      new Uint8Array()
    );

    await erc1155In.connect(you).setApprovalForAll(me.address, true);

    const youEtherBalance0 = await ethers.provider.getBalance(you.address);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].id, 1234);

    compareStructs(flowStruct, flowIO);

    const txFlow = await flow.connect(you).flow(flowStates[1].id, 1234);

    // check input ERC1155 affected balances correctly

    const me1155BalanceIn = await erc1155In.balanceOf(
      me.address,
      flowIO.inputs1155[0].id
    );
    const you1155BalanceIn = await erc1155In.balanceOf(
      you.address,
      flowIO.inputs1155[0].id
    );

    assert(me1155BalanceIn.eq(flowIO.inputs1155[0].amount as BigNumber));
    assert(you1155BalanceIn.isZero());

    // check output Ether affected balances correctly

    const { gasUsed } = await txFlow.wait();
    const { gasPrice } = txFlow;

    const meEtherBalanceOut = await ethers.provider.getBalance(me.address);
    const youEtherBalanceOut = await ethers.provider.getBalance(you.address);

    const expectedYouEtherBalanceOut = youEtherBalance0
      .add(flowIO.outputNative as BigNumber)
      .sub(gasUsed.mul(gasPrice));

    assert(meEtherBalanceOut.isZero());
    assert(
      youEtherBalanceOut.eq(expectedYouEtherBalanceOut),
      `wrong balance
      expected  ${expectedYouEtherBalanceOut}
      got       ${youEtherBalanceOut}`
    );
  });

  it("should flow for erc721<->erc1155 on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const erc721In = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721In.initialize();

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
      inputs721: [
        {
          token: erc721In.address,
          id: 0,
        },
      ],
      outputs721: [],
      inputs1155: [],
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
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      flowIO.inputNative,
      flowIO.outputNative,
      flowIO.inputs721[0].token,
      flowIO.inputs721[0].id,
      flowIO.outputs1155[0].token,
      flowIO.outputs1155[0].id,
      flowIO.outputs1155[0].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWIO_INPUT_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWIO_INPUT_ERC721_ID = () =>
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
      SENTINEL(),
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

    const sources = [REBASE_RATIO(), CAN_TRANSFER()];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC1155Deploy(deployer, flowERC1155Factory, {
      uri: "F1155",
      vmStateConfig: stateConfigStruct,
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    });

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

    const you = signers[1];
    const me = flow;

    // prepare output ERC1155

    await erc1155Out.mintNewToken();

    await erc1155Out.safeTransferFrom(
      signers[0].address,
      me.address,
      flowIO.outputs1155[0].id,
      flowIO.outputs1155[0].amount,
      new Uint8Array()
    );

    // prepare input ERC721

    await erc721In.mintNewToken();

    await erc721In.transferFrom(
      signers[0].address,
      you.address,
      flowIO.inputs721[0].id
    );

    await erc721In.connect(you).approve(me.address, flowIO.inputs721[0].id);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].id, 1234);

    compareStructs(flowStruct, flowIO);

    const _txFlow = await flow.connect(you).flow(flowStates[1].id, 1234);

    // check input ERC721 affected balances correctly

    const me721BalanceIn = await erc721In.balanceOf(me.address);
    const you721BalanceIn = await erc721In.balanceOf(you.address);
    const owner721In = await erc721In.ownerOf(flowIO.inputs721[0].id);

    assert(me721BalanceIn.eq(1));
    assert(you721BalanceIn.isZero());
    assert(owner721In === me.address);

    // check output ERC1155 affected balances correctly

    const me1155BalanceOut = await erc1155Out.balanceOf(
      me.address,
      flowIO.outputs1155[0].id
    );
    const you1155BalanceOut = await erc1155Out.balanceOf(
      you.address,
      flowIO.outputs1155[0].id
    );

    assert(me1155BalanceOut.isZero());
    assert(you1155BalanceOut.eq(flowIO.outputs1155[0].amount as BigNumber));
  });

  it("should flow for erc20<->erc721 on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const erc20In = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await erc20In.initialize();

    const erc721Out = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721Out.initialize();

    const flowIO: FlowIOStruct = {
      inputNative: ethers.BigNumber.from(0),
      outputNative: ethers.BigNumber.from(0),
      inputs20: [
        {
          token: erc20In.address,
          amount: ethers.BigNumber.from(1 + eighteenZeros),
        },
      ],
      outputs20: [],
      inputs721: [],
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
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      flowIO.inputNative,
      flowIO.outputNative,
      flowIO.inputs20[0].token,
      flowIO.inputs20[0].amount,
      flowIO.outputs721[0].token,
      flowIO.outputs721[0].id,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWIO_INPUT_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWIO_INPUT_ERC721_AMOUNT = () =>
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
      SENTINEL(),
      SENTINEL(),
      FLOWIO_INPUT_ERC721_TOKEN(),
      FLOWIO_INPUT_ERC721_AMOUNT(),
      FLOWIO_OUTPUT_NATIVE(),
      FLOWIO_INPUT_NATIVE(),
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [REBASE_RATIO(), CAN_TRANSFER()];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC1155Deploy(deployer, flowERC1155Factory, {
      uri: "F1155",
      vmStateConfig: stateConfigStruct,
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    });

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

    const you = signers[1];
    const me = flow;

    // prepare output ERC721

    await erc721Out.mintNewToken();

    await erc721Out.transferFrom(
      signers[0].address,
      me.address,
      flowIO.outputs721[0].id
    );

    // prepare input ERC721
    await erc20In.transfer(you.address, flowIO.inputs20[0].amount);

    await erc20In.connect(you).approve(me.address, flowIO.inputs20[0].amount);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].id, 1234);

    compareStructs(flowStruct, flowIO);

    const _txFlow = await flow.connect(you).flow(flowStates[1].id, 1234);

    // check input ERC721 affected balances correctly
    const me20BalanceIn = await erc20In.balanceOf(me.address);
    const you20BalanceIn = await erc20In.balanceOf(you.address);

    assert(me20BalanceIn.eq(flowIO.inputs20[0].amount as BigNumber));
    assert(you20BalanceIn.isZero());

    // check output ERC721 affected balances correctly
    const me721BalanceOut = await erc721Out.balanceOf(me.address);
    const you721BalanceOut = await erc721Out.balanceOf(you.address);
    const owner721Out = await erc721Out.ownerOf(flowIO.outputs721[0].id);

    assert(me721BalanceOut.isZero());
    assert(you721BalanceOut.eq(1));
    assert(owner721Out === you.address);
  });

  it("should flow for native<->erc20 on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const erc20Out = (await basicDeploy(
      "ReserveToken18",
      {}
    )) as ReserveToken18;
    await erc20Out.initialize();

    const flowIO: FlowIOStruct = {
      inputNative: ethers.BigNumber.from(1 + sixZeros),
      outputNative: ethers.BigNumber.from(0),
      inputs20: [],
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
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      flowIO.inputNative,
      flowIO.outputNative,
      flowIO.outputs20[0].token,
      flowIO.outputs20[0].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWIO_OUTPUT_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWIO_OUTPUT_ERC721_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));

    const sourceFlowIO = concat([
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      FLOWIO_OUTPUT_ERC721_TOKEN(),
      FLOWIO_OUTPUT_ERC721_AMOUNT(),
      SENTINEL(),
      FLOWIO_OUTPUT_NATIVE(),
      FLOWIO_INPUT_NATIVE(),
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [REBASE_RATIO(), CAN_TRANSFER()];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC1155Deploy(deployer, flowERC1155Factory, {
      uri: "F1155",
      vmStateConfig: stateConfigStruct,
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    });

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

    const you = signers[1];
    const me = flow;

    // prepare output ERC721
    await erc20Out.transfer(me.address, flowIO.outputs20[0].amount);

    // prepare input Ether
    const youBalance0 = await ethers.provider.getBalance(you.address);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].id, 1234, {
        value: ethers.BigNumber.from(flowIO.inputNative),
      });

    compareStructs(flowStruct, flowIO);

    const txFlow = await flow.connect(you).flow(flowStates[1].id, 1234, {
      value: ethers.BigNumber.from(flowIO.inputNative),
    });

    // check input Ether affected balances correctly

    const { gasUsed } = await txFlow.wait();
    const { gasPrice } = txFlow;

    const youEtherBalance1 = await ethers.provider.getBalance(you.address);
    const meEtherBalance1 = await ethers.provider.getBalance(me.address);

    const expectedYouEtherBalance1 = youBalance0
      .sub(flowIO.inputNative as BigNumber)
      .sub(gasUsed.mul(gasPrice));

    assert(
      youEtherBalance1.eq(expectedYouEtherBalance1),
      `wrong balance for you (signer1)
      expected  ${expectedYouEtherBalance1}
      got       ${youEtherBalance1}`
    );

    const expectedMeEtherBalance1 = flowIO.inputNative as BigNumber;

    assert(
      meEtherBalance1.eq(expectedMeEtherBalance1),
      `wrong balance for me (flow contract)
      expected  ${expectedMeEtherBalance1}
      got       ${meEtherBalance1}`
    );

    // check output ERC721 affected balances correctly
    const me20Balance1 = await erc20Out.balanceOf(me.address);
    const you20Balance1 = await erc20Out.balanceOf(you.address);

    assert(me20Balance1.isZero());
    assert(you20Balance1.eq(flowIO.outputs20[0].amount as BigNumber));
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
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
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

    const sources = [REBASE_RATIO(), CAN_TRANSFER()];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC1155Deploy(deployer, flowERC1155Factory, {
      uri: "F1155",
      vmStateConfig: stateConfigStruct,
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    });

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

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

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].id, 1234);

    compareStructs(flowStruct, flowIO);

    const _txFlow = await flow.connect(you).flow(flowStates[1].id, 1234);

    const meBalanceIn = await erc1155In.balanceOf(me.address, 0);
    const meBalanceOut = await erc1155Out.balanceOf(me.address, 0);
    const youBalanceIn = await erc1155In.balanceOf(you.address, 0);
    const youBalanceOut = await erc1155Out.balanceOf(you.address, 0);

    assert(
      meBalanceIn.eq(flowStruct.flow.inputs1155[0].amount),
      `wrong balance for me (flow contract)
      expected  ${flowStruct.flow.inputs1155[0].amount}
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
      youBalanceOut.eq(flowStruct.flow.outputs1155[0].amount),
      `wrong balance for you (signer1 contract)
      expected  ${flowStruct.flow.outputs1155[0].amount}
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
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
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

    const sources = [REBASE_RATIO(), CAN_TRANSFER()];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC1155Deploy(deployer, flowERC1155Factory, {
      uri: "F1155",
      vmStateConfig: stateConfigStruct,
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    });

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

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

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].id, 1234);

    compareStructs(flowStruct, flowIO);

    const _txFlow = await flow.connect(you).flow(flowStates[1].id, 1234);

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

  it("should flow for ERC721<->ERC721 on the good path", async () => {
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
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWIO_INPUT_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWIO_INPUT_ERC721_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWIO_OUTPUT_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));
    const FLOWIO_OUTPUT_ERC721_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));

    const sourceFlowIO = concat([
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      SENTINEL(),
      FLOWIO_OUTPUT_ERC721_TOKEN(),
      FLOWIO_OUTPUT_ERC721_AMOUNT(),
      SENTINEL(),
      FLOWIO_INPUT_ERC721_TOKEN(),
      FLOWIO_INPUT_ERC721_AMOUNT(),
      FLOWIO_OUTPUT_NATIVE(),
      FLOWIO_INPUT_NATIVE(),
      SENTINEL_1155(),
      SENTINEL_1155(),
    ]);

    const sources = [REBASE_RATIO(), CAN_TRANSFER()];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC1155Deploy(deployer, flowERC1155Factory, {
      uri: "F1155",
      vmStateConfig: stateConfigStruct,
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    });

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

    const you = signers[1];
    const me = flow;

    // Ensure parties hold enough ERC721
    await erc20In.transfer(you.address, flowIO.inputs20[0].amount);
    await erc20Out.transfer(me.address, flowIO.outputs20[0].amount);

    await erc20In.connect(you).approve(me.address, flowIO.inputs20[0].amount);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].id, 1234);

    compareStructs(flowStruct, flowIO);

    const _txFlow = await flow.connect(you).flow(flowStates[1].id, 1234);

    const meBalanceIn = await erc20In.balanceOf(me.address);
    const meBalanceOut = await erc20Out.balanceOf(me.address);
    const youBalanceIn = await erc20In.balanceOf(you.address);
    const youBalanceOut = await erc20Out.balanceOf(you.address);

    assert(
      meBalanceIn.eq(flowStruct.flow.inputs20[0].amount),
      `wrong balance for me (flow contract)
      expected  ${flowStruct.flow.inputs20[0].amount}
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
      youBalanceOut.eq(flowStruct.flow.outputs20[0].amount),
      `wrong balance for you (signer1 contract)
      expected  ${flowStruct.flow.outputs20[0].amount}
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
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      flowIO.inputNative,
      flowIO.outputNative,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

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

    const sources = [REBASE_RATIO(), CAN_TRANSFER()];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC1155Deploy(deployer, flowERC1155Factory, {
      uri: "F1155",
      vmStateConfig: stateConfigStruct,
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    });

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

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

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].id, 1234, {
        value: ethers.BigNumber.from(flowIO.inputNative),
      });

    compareStructs(flowStruct, flowIO);

    const txFlow = await flow.connect(you).flow(flowStates[1].id, 1234, {
      value: ethers.BigNumber.from(flowIO.inputNative),
    });

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
      RAIN_FLOW_ERC1155_SENTINEL,
      1,
      flowIO.inputNative,
      flowIO.outputNative,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWIO_INPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWIO_OUTPUT_NATIVE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

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

    const sources = [REBASE_RATIO(), CAN_TRANSFER()];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC1155Deploy(deployer, flowERC1155Factory, {
      uri: "F1155",
      vmStateConfig: stateConfigStruct,
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    });

    await signers[0].sendTransaction({
      to: flow.address,
      value: ethers.BigNumber.from(flowIO.outputNative),
    });
  });
});
