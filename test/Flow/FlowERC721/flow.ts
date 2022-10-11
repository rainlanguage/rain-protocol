import { assert } from "chai";
import { BigNumber } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  FlowERC721Factory,
  FlowIntegrity,
  ReserveToken18,
  ReserveTokenERC1155,
  ReserveTokenERC721,
} from "../../../typechain";
import {
  FlowERC721ConfigStruct,
  FlowERC721IOStruct,
  FlowTransferStruct,
  SaveVMStateEvent,
  StateConfigStruct,
} from "../../../typechain/contracts/flow/erc721/FlowERC721";
import { eighteenZeros, sixZeros } from "../../../utils/constants/bigNumber";
import {
  RAIN_FLOW_ERC721_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basic";
import { flowERC721Deploy } from "../../../utils/deploy/flow/flow";
import { getEvents } from "../../../utils/events";
import { fillEmptyAddressERC721 } from "../../../utils/flow";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { memoryOperand, MemoryType, op } from "../../../utils/rainvm/vm";
import { assertError } from "../../../utils/test/assertError";
import { compareStructs } from "../../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe("FlowERC721 flow tests", async function () {
  let integrity: FlowIntegrity;
  let flowERC721Factory: FlowERC721Factory;

  before(async () => {
    const integrityFactory = await ethers.getContractFactory("FlowIntegrity");
    integrity = (await integrityFactory.deploy()) as FlowIntegrity;
    await integrity.deployed();

    const flowERC721FactoryFactory = await ethers.getContractFactory(
      "FlowERC721Factory",
      {}
    );
    flowERC721Factory = (await flowERC721FactoryFactory.deploy(
      integrity.address
    )) as FlowERC721Factory;
    await flowERC721Factory.deployed();
  });

  it("should support transferPreflight hook", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const flowTransfer: FlowTransferStruct = {
      native: [],
      erc20: [],
      erc721: [],
      erc1155: [],
    };

    const tokenId = 0;

    const flowERC721IO: FlowERC721IOStruct = {
      mints: [{
        account: you.address,
        id: tokenId 
      }], 
      burns: [],
      flow: flowTransfer
    };

    const mintId = flowERC721IO.mints[0].id;

    const constantsCanTransfer = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC721_SENTINEL,
      1,
      mintId, // tokenId
      1,
    ];
    const constantsCannotTransfer = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC721_SENTINEL,
      1,
      mintId, // tokenId
      0,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_721 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const TOKEN_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));

    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const YOU = () => op(Opcode.SENDER);

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE SKIP
      SENTINEL_721(), // BURN SKIP
      SENTINEL_721(), // MINT END
      YOU(),
      TOKEN_ID(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStructCanTransfer: FlowERC721ConfigStruct = {
      name: "FlowERC721",
      symbol: "F721",
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
    const stateConfigStructCannotTransfer: FlowERC721ConfigStruct = {
      name: "FlowERC721",
      symbol: "F721",
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

    const flowCanTransfer = await flowERC721Deploy(
      deployer,
      flowERC721Factory,
      stateConfigStructCanTransfer
    );
    const flowCannotTransfer = await flowERC721Deploy(
      deployer,
      flowERC721Factory,
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

    const signerReceiver = signers[2];

    const _txFlowCanTransfer = await flowCanTransfer
      .connect(you)
      .flow(flowStatesCanTransfer[1].id, 1234);

    const _txFlowCannotTransfer = await flowCannotTransfer
      .connect(you)
      .flow(flowStatesCannotTransfer[1].id, 1234);

    await flowCanTransfer
      .connect(you)
      .transferFrom(you.address, signerReceiver.address, tokenId);

    await assertError(
      async () =>
        await flowCannotTransfer
          .connect(you)
          .transferFrom(you.address, signerReceiver.address, tokenId),
      "INVALID_TRANSFER",
      "transferred when it should not"
    );
  });

  it("should mint and burn tokens per flow in exchange for another token (e.g. native)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const flowTransferMint: FlowTransferStruct = {
      native: [
        {
          from: you.address,
          to: "", // Contract Address
          amount: ethers.BigNumber.from(2 + sixZeros),
        },
        {
          from: "", // Contract Address
          to: you.address,
          amount: ethers.BigNumber.from(0),
        },
      ],
      erc20: [],
      erc721: [],
      erc1155: [],
    };

    const flowTransferBurn: FlowTransferStruct = {
      native: [
        {
          from: you.address,
          to: "", // Contract Address
          amount: ethers.BigNumber.from(0),
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

    // for mint flow (redeem native for erc20)
    const tokenId = 0;
    const flowERC721IOMint: FlowERC721IOStruct = {
      mints: [{
        account: you.address,
        id: tokenId 
      }], 
      burns: [],
      flow: flowTransferMint
    };
    
    const flowERC721IOBurn: FlowERC721IOStruct = {
      mints: [], 
      burns: [{
        account: you.address,
        id: tokenId 
      }],
      flow: flowTransferBurn
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC721_SENTINEL,
      1,
      tokenId,
      flowTransferMint.native[0].amount,
      flowTransferMint.native[1].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_721 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const TOKEN_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    
    const ME = () => op(Opcode.THIS_ADDRESS);
    const YOU = () => op(Opcode.SENDER);
    
    const sourceFlowIOMint = concat([
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
      SENTINEL_721(), // BURN SKIP
      SENTINEL_721(), // MINT END
      YOU(),
      TOKEN_ID(), // mint
    ]);
    const sourceFlowIOBurn = concat([
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
      SENTINEL_721(), // BURN END
      YOU(),
      TOKEN_ID(), // burn
      SENTINEL_721(), // MINT SKIP
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: FlowERC721ConfigStruct = {
      name: "FlowERC721",
      symbol: "F721",
      vmStateConfig: {
        sources,
        constants,
      },
      flows: [
        { sources: [CAN_FLOW(), sourceFlowIOMint], constants },
        { sources: [CAN_FLOW(), sourceFlowIOBurn], constants },
      ],
    };

    const flow = await flowERC721Deploy(
      deployer,
      flowERC721Factory,
      stateConfigStruct
    );

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

    const mintFlowId = flowStates[1].id;
    const burnFlowId = flowStates[2].id;

    const me = flow;

    await assertError(
      async () => await flow.ownerOf(tokenId),
      "ERC721: invalid token ID",
      "token should not yet be minted"
    );

    // prepare input Ether
    const youEtherBalance0 = await ethers.provider.getBalance(you.address);

    // -- PERFORM MINT --

    const flowStructMint = await flow
      .connect(you)
      .callStatic.flow(mintFlowId, 1234, {
        value: ethers.BigNumber.from(flowTransferMint.native[0].amount),
      });

    compareStructs(flowStructMint, fillEmptyAddressERC721(flowERC721IOMint, flow.address));

    const txFlowMint = await flow.connect(you).flow(mintFlowId, 1234, {
      value: ethers.BigNumber.from(flowTransferMint.native[0].amount),
    });

    // check input Ether affected balances correctly

    const { gasUsed } = await txFlowMint.wait();
    const { gasPrice } = txFlowMint;

    const youEtherBalance1 = await ethers.provider.getBalance(you.address);
    const meEtherBalance1 = await ethers.provider.getBalance(me.address);

    const expectedYouEtherBalance1 = youEtherBalance0
      .sub(flowTransferMint.native[0].amount as BigNumber)
      .sub(gasUsed.mul(gasPrice));

    assert(
      youEtherBalance1.eq(expectedYouEtherBalance1),
      `wrong balance for you (signer1)
      expected  ${expectedYouEtherBalance1}
      got       ${youEtherBalance1}`
    );

    const expectedMeEtherBalance1 = flowTransferMint.native[0].amount as BigNumber;

    assert(
      meEtherBalance1.eq(expectedMeEtherBalance1),
      `wrong balance for me (flow contract)
      expected  ${expectedMeEtherBalance1}
      got       ${meEtherBalance1}`
    );

    const me20Balance1 = await flow.balanceOf(me.address);
    const you20Balance1 = await flow.balanceOf(you.address);
    const owner1 = await flow.ownerOf(tokenId);

    assert(me20Balance1.isZero());
    assert(you20Balance1.eq(1));
    assert(owner1 === you.address);

    // -- PERFORM BURN --

    console.log("BURNING");
    const flowStructBurn = await flow
      .connect(you)
      .callStatic.flow(burnFlowId, 1234);

    compareStructs(flowStructBurn, fillEmptyAddressERC721(flowERC721IOBurn, flow.address));

    const txFlowBurn = await flow.connect(you).flow(burnFlowId, 1234);

    const { gasUsed: gasUsedBurn } = await txFlowBurn.wait();
    const { gasPrice: gasPriceBurn } = txFlowBurn;

    const youEtherBalance2 = await ethers.provider.getBalance(you.address);
    const meEtherBalance2 = await ethers.provider.getBalance(me.address);

    const expectedYouEtherBalance2 = youEtherBalance1
      .add(flowTransferBurn.native[1].amount as BigNumber)
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

    const me20Balance2 = await flow.balanceOf(me.address);
    const you20Balance2 = await flow.balanceOf(you.address);
    await assertError(
      async () => await flow.ownerOf(tokenId),
      "ERC721: invalid token ID",
      "token should be burned"
    );

    assert(me20Balance2.isZero());
    assert(you20Balance2.isZero());
  });

  it("should flow for erc1155<->native on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const erc1155In = (await basicDeploy(
      "ReserveTokenERC1155",
      {}
    )) as ReserveTokenERC1155;
    await erc1155In.initialize();

    const flowTransfer: FlowTransferStruct = {
      native: [
        {
          from: you.address,
          to: "", // Contract Address
          amount: ethers.BigNumber.from(0),
        },
        {
          from: "", // Contract Address
          to: you.address,
          amount: ethers.BigNumber.from(2 + sixZeros),
        },
      ],
      erc20: [],
      erc721: [],
      erc1155: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc1155In.address,
          id: 0,
          amount: ethers.BigNumber.from(1 + sixZeros),
        }
      ]
    };

    const flowERC721IO: FlowERC721IOStruct = {
      mints: [], 
      burns: [],
      flow: flowTransfer
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC721_SENTINEL,
      1,
      flowTransfer.native[0].amount,
      flowTransfer.native[1].amount,
      flowTransfer.erc1155[0].token,
      flowTransfer.erc1155[0].id,
      flowTransfer.erc1155[0].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_721 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));

    const ME = () => op(Opcode.THIS_ADDRESS);
    const YOU = () => op(Opcode.SENDER);

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 END
      FLOWTRANSFER_YOU_TO_ME_ERC1155_TOKEN(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC1155_ID(),
      FLOWTRANSFER_YOU_TO_ME_ERC1155_AMOUNT(),
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE END
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT(),
      SENTINEL_721(),
      SENTINEL_721(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC721Deploy(deployer, flowERC721Factory, {
      name: "FlowERC721",
      symbol: "F721",
      vmStateConfig: stateConfigStruct,
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    });

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

    const me = flow;

    // prepare output Ether

    await signers[0].sendTransaction({
      to: me.address,
      value: ethers.BigNumber.from(flowTransfer.native[1].amount),
    });

    // prepare input ERC1155

    await erc1155In.mintNewToken();

    await erc1155In.safeTransferFrom(
      signers[0].address,
      you.address,
      flowTransfer.erc1155[0].id,
      flowTransfer.erc1155[0].amount,
      new Uint8Array()
    );

    await erc1155In.connect(you).setApprovalForAll(me.address, true);

    const youEtherBalance0 = await ethers.provider.getBalance(you.address);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].id, 1234);

    compareStructs(flowStruct, fillEmptyAddressERC721(flowERC721IO, me.address));

    const txFlow = await flow.connect(you).flow(flowStates[1].id, 1234);

    // check input ERC1155 affected balances correctly

    const me1155BalanceIn = await erc1155In.balanceOf(
      me.address,
      flowTransfer.erc1155[0].id
    );
    const you1155BalanceIn = await erc1155In.balanceOf(
      you.address,
      flowTransfer.erc1155[0].id
    );

    assert(me1155BalanceIn.eq(flowTransfer.erc1155[0].amount as BigNumber));
    assert(you1155BalanceIn.isZero());

    // check output Ether affected balances correctly

    const { gasUsed } = await txFlow.wait();
    const { gasPrice } = txFlow;

    const meEtherBalanceOut = await ethers.provider.getBalance(me.address);
    const youEtherBalanceOut = await ethers.provider.getBalance(you.address);

    const expectedYouEtherBalanceOut = youEtherBalance0
      .add(flowTransfer.native[1].amount as BigNumber)
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
    const you = signers[1];

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

    const flowTransfer: FlowTransferStruct = {
      native: [],
      erc20: [],
      erc721: [
        {
          token: erc721In.address,
          from: you.address,
          to: "", // Contract Address
          id: 0,
        },
      ],
      erc1155: [
        {
          token: erc1155Out.address,
          id: 0,
          amount: ethers.BigNumber.from(2 + sixZeros),
          from: "", // Contract Address
          to:  you.address, 
        },
      ],
    };

    const flowERC721IO: FlowERC721IOStruct = {
      mints: [], 
      burns: [],
      flow: flowTransfer
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC721_SENTINEL,
      1,
      flowTransfer.erc721[0].token,
      flowTransfer.erc721[0].id,
      flowTransfer.erc1155[0].token,
      flowTransfer.erc1155[0].id,
      flowTransfer.erc1155[0].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_721 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_YOU_TO_ME_ERC721_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_ME_TO_YOU_ERC1155_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));

    const ME = () => op(Opcode.THIS_ADDRESS);
    const YOU = () => op(Opcode.SENDER);
    
    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 END
      FLOWTRANSFER_ME_TO_YOU_ERC1155_TOKEN(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_ERC1155_ID(),
      FLOWTRANSFER_ME_TO_YOU_ERC1155_AMOUNT(),
      SENTINEL(), // ERC721 END
      FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC721_ID(),
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE SKIP
      SENTINEL_721(),
      SENTINEL_721(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC721Deploy(deployer, flowERC721Factory, {
      name: "FlowERC721",
      symbol: "F721",
      vmStateConfig: stateConfigStruct,
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    });

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

    const me = flow;

    // prepare output ERC1155

    await erc1155Out.mintNewToken();

    await erc1155Out.safeTransferFrom(
      signers[0].address,
      me.address,
      flowTransfer.erc1155[0].id,
      flowTransfer.erc1155[0].amount,
      new Uint8Array()
    );

    // prepare input ERC721

    await erc721In.mintNewToken();

    await erc721In.transferFrom(
      signers[0].address,
      you.address,
      flowTransfer.erc721[0].id
    );

    await erc721In.connect(you).approve(me.address, flowTransfer.erc721[0].id);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].id, 1234);

    compareStructs(flowStruct, fillEmptyAddressERC721(flowERC721IO, me.address));

    const _txFlow = await flow.connect(you).flow(flowStates[1].id, 1234);

    // check input ERC721 affected balances correctly

    const me721BalanceIn = await erc721In.balanceOf(me.address);
    const you721BalanceIn = await erc721In.balanceOf(you.address);
    const owner721In = await erc721In.ownerOf(flowTransfer.erc721[0].id);

    assert(me721BalanceIn.eq(1));
    assert(you721BalanceIn.isZero());
    assert(owner721In === me.address);

    // check output ERC1155 affected balances correctly

    const me1155BalanceOut = await erc1155Out.balanceOf(
      me.address,
      flowTransfer.erc1155[0].id
    );
    const you1155BalanceOut = await erc1155Out.balanceOf(
      you.address,
      flowTransfer.erc1155[0].id
    );

    assert(me1155BalanceOut.isZero());
    assert(you1155BalanceOut.eq(flowTransfer.erc1155[0].amount as BigNumber));
  });

  it("should flow for erc20<->erc721 on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const erc20In = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await erc20In.initialize();

    const erc721Out = (await basicDeploy(
      "ReserveTokenERC721",
      {}
    )) as ReserveTokenERC721;
    await erc721Out.initialize();

    const flowTransfer: FlowTransferStruct = {
      native: [],
      erc20: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc20In.address,
          amount: ethers.BigNumber.from(1 + eighteenZeros),
        },
      ],
      erc721: [
        {
          token: erc721Out.address,
          from: "",
          to: you.address, // Contract Address
          id: 0,
        },
      ],
      erc1155: [],
    };

    const flowERC721IO: FlowERC721IOStruct = {
      mints: [], 
      burns: [],
      flow: flowTransfer
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC721_SENTINEL,
      1,
      flowTransfer.erc20[0].token,
      flowTransfer.erc20[0].amount,
      flowTransfer.erc721[0].token,
      flowTransfer.erc721[0].id,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_721 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));

    const ME = () => op(Opcode.THIS_ADDRESS);
    const YOU = () => op(Opcode.SENDER);

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 END
      FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_ERC721_ID(),
      SENTINEL(), // ERC20 END
      FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT(),
      SENTINEL(), // NATIVE SKIP
      SENTINEL_721(),
      SENTINEL_721(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC721Deploy(deployer, flowERC721Factory, {
      name: "FlowERC721",
      symbol: "F721",
      vmStateConfig: stateConfigStruct,
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    });

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

    const me = flow;

    // prepare output ERC721

    await erc721Out.mintNewToken();

    await erc721Out.transferFrom(
      signers[0].address,
      me.address,
      flowTransfer.erc721[0].id
    );

    // prepare input ERC721
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);

    await erc20In.connect(you).approve(me.address, flowTransfer.erc20[0].amount);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].id, 1234);

    compareStructs(flowStruct, fillEmptyAddressERC721(flowERC721IO, me.address));

    const _txFlow = await flow.connect(you).flow(flowStates[1].id, 1234);

    // check input ERC721 affected balances correctly
    const me20BalanceIn = await erc20In.balanceOf(me.address);
    const you20BalanceIn = await erc20In.balanceOf(you.address);

    assert(me20BalanceIn.eq(flowTransfer.erc20[0].amount as BigNumber));
    assert(you20BalanceIn.isZero());

    // check output ERC721 affected balances correctly
    const me721BalanceOut = await erc721Out.balanceOf(me.address);
    const you721BalanceOut = await erc721Out.balanceOf(you.address);
    const owner721Out = await erc721Out.ownerOf(flowTransfer.erc721[0].id);

    assert(me721BalanceOut.isZero());
    assert(you721BalanceOut.eq(1));
    assert(owner721Out === you.address);
  });

  it("should flow for native<->erc20 on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const erc20Out = (await basicDeploy(
      "ReserveToken18",
      {}
    )) as ReserveToken18;
    await erc20Out.initialize();

    const flowTransfer: FlowTransferStruct = {
      native: [
        {
          from: you.address,
          to: "", // Contract Address
          amount: ethers.BigNumber.from(1 + sixZeros),
        }
      ],
      erc20: [
        {
          from: "", // Contract address
          to: you.address,
          token: erc20Out.address,
          amount: ethers.BigNumber.from(2 + eighteenZeros),
        },
      ],
      erc721: [],
      erc1155: [],
    };
    const flowERC721IO: FlowERC721IOStruct = {
      mints: [], 
      burns: [],
      flow: flowTransfer
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC721_SENTINEL,
      1,
      flowTransfer.native[0].amount,
      flowTransfer.erc20[0].token,
      flowTransfer.erc20[0].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_721 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    
    const FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
  
    const ME = () => op(Opcode.THIS_ADDRESS);
    const YOU = () => op(Opcode.SENDER);
    
    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 END
      FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT(),
      SENTINEL(), // NATIVE END
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT(),
      SENTINEL_721(),
      SENTINEL_721(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC721Deploy(deployer, flowERC721Factory, {
      name: "FlowERC721",
      symbol: "F721",
      vmStateConfig: stateConfigStruct,
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    });

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

    const me = flow;

    // prepare output ERC721
    await erc20Out.transfer(me.address, flowTransfer.erc20[0].amount);

    // prepare input Ether
    const youBalance0 = await ethers.provider.getBalance(you.address);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].id, 1234, {
        value: ethers.BigNumber.from(flowTransfer.native[0].amount),
      });

    compareStructs(flowStruct, fillEmptyAddressERC721(flowERC721IO, me.address));

    const txFlow = await flow.connect(you).flow(flowStates[1].id, 1234, {
      value: ethers.BigNumber.from(flowTransfer.native[0].amount),
    });

    // check input Ether affected balances correctly

    const { gasUsed } = await txFlow.wait();
    const { gasPrice } = txFlow;

    const youEtherBalance1 = await ethers.provider.getBalance(you.address);
    const meEtherBalance1 = await ethers.provider.getBalance(me.address);

    const expectedYouEtherBalance1 = youBalance0
      .sub(flowTransfer.native[0].amount as BigNumber)
      .sub(gasUsed.mul(gasPrice));

    assert(
      youEtherBalance1.eq(expectedYouEtherBalance1),
      `wrong balance for you (signer1)
      expected  ${expectedYouEtherBalance1}
      got       ${youEtherBalance1}`
    );

    const expectedMeEtherBalance1 = flowTransfer.native[0].amount as BigNumber;

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
    assert(you20Balance1.eq(flowTransfer.erc20[0].amount as BigNumber));
  });

  it("should flow for ERC1155<->ERC1155 on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

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

    const flowTransfer: FlowTransferStruct = {
      native: [],
      erc20: [],
      erc721: [],
      erc1155: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc1155In.address,
          id: 0,
          amount: ethers.BigNumber.from(1 + sixZeros),
        },
        {
          from: "",
          to: you.address, // Contract address
          token: erc1155Out.address,
          id: 0,
          amount: ethers.BigNumber.from(2 + sixZeros),
        },
      ],
    };

    const flowERC721IO: FlowERC721IOStruct = {
      mints: [], 
      burns: [],
      flow: flowTransfer
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC721_SENTINEL,
      1,
      flowTransfer.erc1155[0].token,
      flowTransfer.erc1155[0].id,
      flowTransfer.erc1155[0].amount,
      flowTransfer.erc1155[1].token,
      flowTransfer.erc1155[1].id,
      flowTransfer.erc1155[1].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_721 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const FLOWTRANSFER_YOU_TO_ME_ERC1155_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));

    const FLOWTRANSFER_ME_TO_YOU_ERC1155_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));

    const YOU = () => op(Opcode.SENDER);
    const ME = () => op(Opcode.THIS_ADDRESS);
    
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
      SENTINEL_721(),
      SENTINEL_721(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC721Deploy(deployer, flowERC721Factory, {
      name: "FlowERC721",
      symbol: "F721",
      vmStateConfig: stateConfigStruct,
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    });

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

    const me = flow;

    // Ensure parties hold ERC1155 tokens
    await erc1155In.mintNewToken();
    await erc1155Out.mintNewToken();

    await erc1155In.safeTransferFrom(
      signers[0].address,
      you.address,
      flowTransfer.erc1155[0].id,
      flowTransfer.erc1155[0].amount,
      new Uint8Array()
    );

    await erc1155Out.safeTransferFrom(
      signers[0].address,
      me.address,
      flowTransfer.erc1155[1].id,
      flowTransfer.erc1155[1].amount,
      new Uint8Array()
    );

    await erc1155In.connect(you).setApprovalForAll(me.address, true);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].id, 1234);

    compareStructs(flowStruct, fillEmptyAddressERC721(flowERC721IO, me.address));

    const _txFlow = await flow.connect(you).flow(flowStates[1].id, 1234);

    const meBalanceIn = await erc1155In.balanceOf(me.address, 0);
    const meBalanceOut = await erc1155Out.balanceOf(me.address, 0);
    const youBalanceIn = await erc1155In.balanceOf(you.address, 0);
    const youBalanceOut = await erc1155Out.balanceOf(you.address, 0);

    assert(
      meBalanceIn.eq(await flowERC721IO.flow.erc1155[0].amount),
      `wrong balance for me (flow contract)
      expected  ${flowStruct.flow.erc1155[0].amount}
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
      youBalanceOut.eq(await flowERC721IO.flow.erc1155[1].amount),
      `wrong balance for you (signer1 contract)
      expected  ${flowStruct.flow.erc1155[1].amount}
      got       ${youBalanceOut}`
    );
  });

  it("should flow for ERC721<->ERC721 on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

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

    const flowTransfer: FlowTransferStruct = {
      native: [],
      erc20: [],
      erc721: [
        {
          token: erc721In.address,
          from: you.address,
          to: "", // Contract Address
          id: 0,
        },
        {
          token: erc721Out.address,
          from: "", // Contract Address
          to: you.address,
          id: 0,
        },
      ],
      erc1155: [],
    };

    const flowERC721IO: FlowERC721IOStruct = {
      mints: [], 
      burns: [],
      flow: flowTransfer
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC721_SENTINEL,
      1,
      flowTransfer.erc721[0].token,
      flowTransfer.erc721[0].id,
      flowTransfer.erc721[1].token,
      flowTransfer.erc721[1].id,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_721 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_YOU_TO_ME_ERC721_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    
    const ME = () => op(Opcode.THIS_ADDRESS);
    const YOU = () => op(Opcode.SENDER);
    
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
      SENTINEL_721(),
      SENTINEL_721(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC721Deploy(deployer, flowERC721Factory, {
      name: "FlowERC721",
      symbol: "F721",
      vmStateConfig: stateConfigStruct,
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    });

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

    const me = flow;

    // Ensure parties hold ERC721 tokens
    await erc721In.mintNewToken();
    await erc721Out.mintNewToken();

    await erc721In.transferFrom(
      signers[0].address,
      you.address,
      flowTransfer.erc721[0].id
    );
    await erc721Out.transferFrom(
      signers[0].address,
      me.address,
      flowTransfer.erc721[1].id
    );

    await erc721In.connect(you).approve(me.address, flowTransfer.erc721[0].id);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].id, 1234);

    compareStructs(flowStruct, fillEmptyAddressERC721(flowERC721IO, me.address));

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

  it("should flow for ERC20<->ERC20 on the good path", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const erc20In = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await erc20In.initialize();

    const erc20Out = (await basicDeploy(
      "ReserveToken18",
      {}
    )) as ReserveToken18;
    await erc20Out.initialize();

    const flowTransfer: FlowTransferStruct = {
      native: [],
      erc20: [
        {
          from: you.address,
          to: "", // Contract address
          token: erc20In.address,
          amount: ethers.BigNumber.from(1 + eighteenZeros),
        },
        {
          from: "", // Contract address
          to: you.address,
          token: erc20Out.address,
          amount: ethers.BigNumber.from(2 + eighteenZeros),
        },
      ],
      erc721: [],
      erc1155: [],
    };

    const flowERC721IO: FlowERC721IOStruct = {
      mints: [], 
      burns: [],
      flow: flowTransfer
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC721_SENTINEL,
      1,
      flowTransfer.erc20[0].token,
      flowTransfer.erc20[0].amount,
      flowTransfer.erc20[1].token,
      flowTransfer.erc20[1].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_721 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));

    const ME = () => op(Opcode.THIS_ADDRESS);
    const YOU = () => op(Opcode.SENDER);

    const sourceFlowIO = concat([
      SENTINEL(), // ERC115 SKIP
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
      SENTINEL(), // NATIVE SKIP
      SENTINEL_721(),
      SENTINEL_721(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC721Deploy(deployer, flowERC721Factory, {
      name: "FlowERC721",
      symbol: "F721",
      vmStateConfig: stateConfigStruct,
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    });

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

    const me = flow;

    // Ensure parties hold enough ERC721
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In.connect(you).approve(me.address, flowTransfer.erc20[0].amount);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].id, 1234);

    compareStructs(flowStruct, fillEmptyAddressERC721(flowERC721IO, me.address));

    const _txFlow = await flow.connect(you).flow(flowStates[1].id, 1234);

    const meBalanceIn = await erc20In.balanceOf(me.address);
    const meBalanceOut = await erc20Out.balanceOf(me.address);
    const youBalanceIn = await erc20In.balanceOf(you.address);
    const youBalanceOut = await erc20Out.balanceOf(you.address);

    assert(
      meBalanceIn.eq(await flowERC721IO.flow.erc20[0].amount),
      `wrong balance for me (flow contract)
      expected  ${flowStruct.flow.erc20[0].amount}
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
      youBalanceOut.eq(await flowERC721IO.flow.erc20[1].amount),
      `wrong balance for you (signer1 contract)
      expected  ${flowStruct.flow.erc20[1].amount}
      got       ${youBalanceOut}`
    );
  });

  it("should flow for native<->native on the good path", async () => {
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

    const flowERC721IO: FlowERC721IOStruct = {
      mints: [], 
      burns: [],
      flow: flowTransfer
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC721_SENTINEL,
      1,
      flowTransfer.native[0].amount,
      flowTransfer.native[1].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_721 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const ME = () => op(Opcode.THIS_ADDRESS);
    const YOU = () => op(Opcode.SENDER);

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
      SENTINEL_721(),
      SENTINEL_721(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC721Deploy(deployer, flowERC721Factory, {
      name: "FlowERC721",
      symbol: "F721",
      vmStateConfig: stateConfigStruct,
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    });

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

    const me = flow;

    // Ensure Flow contract holds enough Ether
    await signers[0].sendTransaction({
      to: me.address,
      value: ethers.BigNumber.from(await flowTransfer.native[1].amount),
    });

    const youBalance0 = await ethers.provider.getBalance(you.address);
    const meBalance0 = await ethers.provider.getBalance(me.address);

    assert(meBalance0.eq(await flowTransfer.native[1].amount));

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].id, 1234, {
        value: ethers.BigNumber.from(await flowTransfer.native[0].amount),
      });

    compareStructs(flowStruct, fillEmptyAddressERC721(flowERC721IO, me.address));

    const txFlow = await flow.connect(you).flow(flowStates[1].id, 1234, {
      value: ethers.BigNumber.from(await flowTransfer.native[0].amount),
    });

    const { gasUsed } = await txFlow.wait();
    const { gasPrice } = txFlow;

    const youBalance1 = await ethers.provider.getBalance(you.address);
    const meBalance1 = await ethers.provider.getBalance(me.address);

    const expectedYouBalance1 = youBalance0
      .sub(await flowTransfer.native[0].amount)
      .add(await flowTransfer.native[1].amount)
      .sub(gasUsed.mul(gasPrice));

    assert(
      youBalance1.eq(expectedYouBalance1),
      `wrong balance for you (signer1)
      expected  ${expectedYouBalance1}
      got       ${youBalance1}`
    );

    const expectedMeBalance1 = meBalance0
      .add(await flowTransfer.native[0].amount)
      .sub(await flowTransfer.native[1].amount);

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

    const flowERC721IO: FlowERC721IOStruct = {
      mints: [], 
      burns: [],
      flow: flowTransfer
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC721_SENTINEL,
      1,
      flowTransfer.native[0].amount,
      flowTransfer.native[1].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_721 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const ME = () => op(Opcode.THIS_ADDRESS);
    const YOU = () => op(Opcode.SENDER);

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
      SENTINEL_721(),
      SENTINEL_721(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: StateConfigStruct = {
      sources,
      constants,
    };

    const flow = await flowERC721Deploy(deployer, flowERC721Factory, {
      name: "FlowERC721",
      symbol: "F721",
      vmStateConfig: stateConfigStruct,
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    });

    await signers[0].sendTransaction({
      to: flow.address,
      value: ethers.BigNumber.from(flowTransfer.native[1].amount),
    });
  });
});
