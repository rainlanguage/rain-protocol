import { assert } from "chai";
import { BigNumber } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  CloneFactory,
  ReserveToken18,
  ReserveTokenERC1155,
  ReserveTokenERC721,
} from "../../../typechain";
import {
  Flow,
  FlowTransferStruct,
} from "../../../typechain/contracts/flow/basic/Flow";
import { FlowTransferStructOutput } from "../../../typechain/contracts/flow/erc1155/FlowERC1155";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import { assertError } from "../../../utils";
import { eighteenZeros, sixZeros } from "../../../utils/constants/bigNumber";
import { RAIN_FLOW_SENTINEL } from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import {
  deployFlowClone,
  flowImplementation,
} from "../../../utils/deploy/flow/basic/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { getEvents } from "../../../utils/events";
import { fillEmptyAddress } from "../../../utils/flow";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { compareStructs } from "../../../utils/test/compareStructs";
import { FlowConfig } from "../../../utils/types/flow";

const Opcode = AllStandardOps;

describe("Flow flow tests", async function () {
  let implementation: Flow;
  let cloneFactory: CloneFactory;
  const ME = () => op(Opcode.context, 0x0001); // base context this
  const YOU = () => op(Opcode.context, 0x0000); // base context sender

  before(async () => {
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);

    implementation = await flowImplementation();

    //Deploy Clone Factory
    cloneFactory = (await basicDeploy("CloneFactory", {})) as CloneFactory;
  });

  it("should flow for erc1155<->native on the good path", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

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
          token: erc1155In.address,
          id: 0,
          amount: ethers.BigNumber.from(1 + sixZeros),
          from: you.address,
          to: "", // Contract Address
        },
      ],
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowTransfer.native[0].amount,
      flowTransfer.native[1].amount,
      flowTransfer.erc1155[0].token,
      flowTransfer.erc1155[0].id,
      flowTransfer.erc1155[0].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_ID = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 6));

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
    ]);

    const flowConfigStruct: FlowConfig = {
      flows: [{ sources: [sourceFlowIO], constants }],
    };

    const { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

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
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(flowStruct, fillEmptyAddress(flowTransfer, flow.address));

    const txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

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
    const [deployer, you] = signers;

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
          from: "", // Contract address
          to: you.address,
        },
      ],
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowTransfer.erc721[0].token,
      flowTransfer.erc721[0].id,
      flowTransfer.erc1155[0].token,
      flowTransfer.erc1155[0].id,
      flowTransfer.erc1155[0].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_ERC721_ID = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_ID = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 6));

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
    ]);

    const flowConfigStruct: FlowConfig = {
      flows: [{ sources: [sourceFlowIO], constants }],
    };

    const { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

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
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(flowStruct, fillEmptyAddress(flowTransfer, flow.address));

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

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
    const [deployer, you] = signers;

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
          from: "", // Contract address
          to: you.address,
          id: 0,
        },
      ],
      erc1155: [],
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowTransfer.erc20[0].token,
      flowTransfer.erc20[0].amount,
      flowTransfer.erc721[0].token,
      flowTransfer.erc721[0].id,
    ];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_ID = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 5));

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
    ]);

    const flowConfigStruct: FlowConfig = {
      flows: [{ sources: [sourceFlowIO], constants }],
    };

    const { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const me = flow;

    // prepare output ERC721

    await erc721Out.mintNewToken();

    await erc721Out.transferFrom(
      signers[0].address,
      me.address,
      flowTransfer.erc721[0].id
    );

    // prepare input ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    const flowStruct = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(flowStruct, fillEmptyAddress(flowTransfer, flow.address));

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    // check input ERC20 affected balances correctly
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
    const [deployer, you] = signers;

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
        },
        {
          from: "", // Contract Address
          to: you.address,
          amount: ethers.BigNumber.from(0),
        },
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

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowTransfer.native[0].amount,
      flowTransfer.native[1].amount,
      flowTransfer.erc20[0].token,
      flowTransfer.erc20[0].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 5));

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
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT(),
    ]);

    const flowConfigStruct: FlowConfig = {
      flows: [{ sources: [sourceFlowIO], constants }],
    };

    const { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const me = flow;

    // prepare output ERC20
    await erc20Out.transfer(me.address, flowTransfer.erc20[0].amount);

    // prepare input Ether
    const youBalance0 = await ethers.provider.getBalance(you.address);

    const flowStruct = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], [], {
        value: ethers.BigNumber.from(flowTransfer.native[0].amount),
      });

    compareStructs(flowStruct, fillEmptyAddress(flowTransfer, flow.address));

    const txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], [], {
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

    // check output ERC20 affected balances correctly
    const me20Balance1 = await erc20Out.balanceOf(me.address);
    const you20Balance1 = await erc20Out.balanceOf(you.address);

    assert(me20Balance1.isZero());
    assert(you20Balance1.eq(flowTransfer.erc20[0].amount as BigNumber));
  });

  it("should flow for ERC1155<->ERC1155 on the good path", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

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
          from: "", // Contract address
          to: you.address,
          token: erc1155Out.address,
          id: 0,
          amount: ethers.BigNumber.from(2 + sixZeros),
        },
      ],
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowTransfer.erc1155[0].token,
      flowTransfer.erc1155[0].id,
      flowTransfer.erc1155[0].amount,
      flowTransfer.erc1155[1].token,
      flowTransfer.erc1155[1].id,
      flowTransfer.erc1155[1].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_ID = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_ID = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 7));

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
    ]);

    const flowConfigStruct: FlowConfig = {
      flows: [{ sources: [sourceFlowIO], constants }],
    };

    const { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

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

    const flowStruct: FlowTransferStructOutput = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(flowStruct, fillEmptyAddress(flowTransfer, flow.address));

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    const meBalanceIn = await erc1155In.balanceOf(me.address, 0);
    const meBalanceOut = await erc1155Out.balanceOf(me.address, 0);
    const youBalanceIn = await erc1155In.balanceOf(you.address, 0);
    const youBalanceOut = await erc1155Out.balanceOf(you.address, 0);

    for (const erc1155Transfer of flowStruct.erc1155) {
      if (erc1155Transfer.to == me.address) {
        assert(
          meBalanceIn.eq(erc1155Transfer.amount),
          `wrong balance for me (flow contract)
          expected  ${erc1155Transfer.amount}
          got       ${meBalanceIn}`
        );
      } else if (erc1155Transfer.to == you.address) {
        assert(
          youBalanceOut.eq(erc1155Transfer.amount),
          `wrong balance for you (signer1 contract)
          expected  ${erc1155Transfer.amount}
          got       ${youBalanceOut}`
        );
      }
    }

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
  });

  it("should flow for ERC721<->ERC721 on the good path", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

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

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowTransfer.erc721[0].token,
      flowTransfer.erc721[0].id,
      flowTransfer.erc721[1].token,
      flowTransfer.erc721[1].id,
    ];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_ERC721_ID = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_ID = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 5));

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
    ]);

    const flowConfigStruct: FlowConfig = {
      flows: [{ sources: [sourceFlowIO], constants }],
    };

    const { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

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
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(flowStruct, fillEmptyAddress(flowTransfer, flow.address));

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

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
    const [deployer, you] = signers;

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

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowTransfer.erc20[0].token,
      flowTransfer.erc20[0].amount,
      flowTransfer.erc20[1].token,
      flowTransfer.erc20[1].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 5));

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
    ]);

    const flowConfigStruct: FlowConfig = {
      flows: [{ sources: [sourceFlowIO], constants }],
    };

    const { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const me = flow;

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    const flowStruct = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(flowStruct, fillEmptyAddress(flowTransfer, flow.address));

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    const meBalanceIn = await erc20In.balanceOf(me.address);
    const meBalanceOut = await erc20Out.balanceOf(me.address);
    const youBalanceIn = await erc20In.balanceOf(you.address);
    const youBalanceOut = await erc20Out.balanceOf(you.address);

    for (const erc20Transfer of flowStruct.erc20) {
      if (erc20Transfer.to == me.address) {
        assert(
          meBalanceIn.eq(erc20Transfer.amount),
          `wrong balance for me (flow contract)
          expected  ${erc20Transfer.amount}
          got       ${meBalanceIn}`
        );
      } else if (erc20Transfer.to == you.address) {
        assert(
          youBalanceOut.eq(erc20Transfer.amount),
          `wrong balance for you (signer1 contract)
          expected  ${erc20Transfer.amount}
          got       ${youBalanceOut}`
        );
      }
    }

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
  });

  it("should flow for native<->native on the good path", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

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
          amount: ethers.BigNumber.from(3 + sixZeros),
        },
      ],
      erc20: [],
      erc721: [],
      erc1155: [],
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowTransfer.native[0].amount,
      flowTransfer.native[1].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));

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
    ]);

    const flowConfigStruct: FlowConfig = {
      flows: [{ sources: [sourceFlowIO], constants }],
    };

    const { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const me = flow;

    // Ensure Flow contract holds enough Ether
    await signers[0].sendTransaction({
      to: me.address,
      value: ethers.BigNumber.from(flowTransfer.native[1].amount),
    });

    const youBalance0 = await ethers.provider.getBalance(you.address);
    const meBalance0 = await ethers.provider.getBalance(me.address);

    assert(meBalance0.eq(await flowTransfer.native[1].amount));

    const flowStruct = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], [], {
        value: ethers.BigNumber.from(flowTransfer.native[0].amount),
      });
    compareStructs(flowStruct, fillEmptyAddress(flowTransfer, flow.address));

    const txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], [], {
        value: ethers.BigNumber.from(flowTransfer.native[0].amount),
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

    const constants = [RAIN_FLOW_SENTINEL, 1];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE END
    ]);

    const flowConfigStruct: FlowConfig = {
      flows: [{ sources: [sourceFlowIO], constants }],
    };

    const { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    );

    await signers[0].sendTransaction({
      to: flow.address,
      value: ethers.BigNumber.from(ethers.BigNumber.from(1 + sixZeros)),
    });
  });

  it("should error if native flow (to & from) is other than the source contract", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you, bob] = signers;

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
          amount: ethers.BigNumber.from(3 + sixZeros),
        },
      ],
      erc20: [],
      erc721: [],
      erc1155: [],
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowTransfer.native[0].amount,
      flowTransfer.native[1].amount,
      bob.address,
    ];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    const BOB = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4));

    const sourceFlowIOIn = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE END
      YOU(),
      BOB(), // Invalid transfer
      FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT(),
    ]);

    const sourceFlowIOOOut = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE END
      YOU(),
      ME(), // Invalid transfer
      FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT(),
      BOB(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT(),
    ]);

    const flowConfigStruct: FlowConfig = {
      flows: [
        { sources: [sourceFlowIOIn], constants },
        { sources: [sourceFlowIOOOut], constants },
      ],
    };

    const { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const me = flow;

    const dispatchIN = flowInitialized[0].evaluable;
    const dispatchOUT = flowInitialized[1].evaluable;

    // Ensure Flow contract holds enough Ether
    await signers[0].sendTransaction({
      to: me.address,
      value: ethers.BigNumber.from(flowTransfer.native[1].amount),
    });

    await assertError(
      async () =>
        await flow.connect(you).flow(dispatchIN, [1234], [], {
          value: ethers.BigNumber.from(flowTransfer.native[0].amount),
        }),
      "UnsupportedNativeFlow()",
      "Flowed an unsupported Native Flow"
    );

    await assertError(
      async () =>
        await flow.connect(you).flow(dispatchOUT, [1234], [], {
          value: ethers.BigNumber.from(flowTransfer.native[0].amount),
        }),
      "UnsupportedNativeFlow()",
      "Flowed an unsupported Native Flow"
    );
  });

  it("should error if ERC20 flow (from) is other than the source contract or msg.sender", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you, bob] = signers;

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

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowTransfer.erc20[0].token,
      flowTransfer.erc20[0].amount,
      flowTransfer.erc20[1].token,
      flowTransfer.erc20[1].amount,
      bob.address,
    ];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 5));
    const BOB = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 6));

    const sourceFlowIOIN = concat([
      SENTINEL(), // ERC115 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 END
      FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN(),
      BOB(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT(),
      FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT(),
      SENTINEL(), // NATIVE SKIP
    ]);

    const sourceFlowIOOUT = concat([
      SENTINEL(), // ERC115 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 END
      FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT(),
      FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN(),
      BOB(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT(),
      SENTINEL(), // NATIVE SKIP
    ]);

    const flowConfigStruct: FlowConfig = {
      flows: [
        { sources: [sourceFlowIOIN], constants },
        { sources: [sourceFlowIOOUT], constants },
      ],
    };

    const { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const me = flow;

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    const dispatchIN = flowInitialized[0].evaluable;
    const dispatchOUT = flowInitialized[1].evaluable;

    await assertError(
      async () => await flow.connect(you).flow(dispatchIN, [1234], []),
      "UnsupportedERC20Flow()",
      "Flowed an unsupported ERC20 Flow"
    );

    await assertError(
      async () => await flow.connect(you).flow(dispatchOUT, [1234], []),
      "UnsupportedERC20Flow()",
      "Flowed an unsupported ERC20 Flow"
    );
  });

  it("should error if ERC721 flow (from) is other than the source contract or msg.sender", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you, bob] = signers;

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

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowTransfer.erc721[0].token,
      flowTransfer.erc721[0].id,
      flowTransfer.erc721[1].token,
      flowTransfer.erc721[1].id,
      bob.address,
    ];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_ERC721_ID = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_ID = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 5));
    const BOB = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 6));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 END
      FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN(),
      BOB(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC721_ID(),
      FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN(),
      ME(),
      YOU(),
      FLOWTRANSFER_ME_TO_YOU_ERC721_ID(),
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE SKIP
    ]);

    const flowConfigStruct: FlowConfig = {
      flows: [{ sources: [sourceFlowIO], constants }],
    };

    const { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

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

    await assertError(
      async () =>
        await flow.connect(you).flow(flowInitialized[0].evaluable, [1234], []),
      "UnsupportedERC721Flow()",
      "Flowed an unsupported ERC721 Flow"
    );
  });

  it("should error if ERC1155 flow (from) is other than the source contract or msg.sender", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you, bob] = signers;

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
          from: "", // Contract address
          to: you.address,
          token: erc1155Out.address,
          id: 0,
          amount: ethers.BigNumber.from(2 + sixZeros),
        },
      ],
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowTransfer.erc1155[0].token,
      flowTransfer.erc1155[0].id,
      flowTransfer.erc1155[0].amount,
      flowTransfer.erc1155[1].token,
      flowTransfer.erc1155[1].id,
      flowTransfer.erc1155[1].amount,
      bob.address,
    ];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_ID = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_ID = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 7));
    const BOB = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 8));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 END
      FLOWTRANSFER_YOU_TO_ME_ERC1155_TOKEN(),
      BOB(),
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
    ]);

    const flowConfigStruct: FlowConfig = {
      flows: [{ sources: [sourceFlowIO], constants }],
    };

    const { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

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

    await assertError(
      async () =>
        await flow.connect(you).flow(flowInitialized[0].evaluable, [1234], []),
      "UnsupportedERC1155Flow()",
      "Flowed an unsupported ERC1155 Flow"
    );
  });

  it("should error if the flow being evaluated is unregistered", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

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

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowTransfer.erc20[0].token,
      flowTransfer.erc20[0].amount,
      flowTransfer.erc20[1].token,
      flowTransfer.erc20[1].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 5));

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
    ]);

    const flowConfigStruct: FlowConfig = {
      flows: [{ sources: [sourceFlowIO], constants }],
    };

    // Deploying flow 0
    let { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    );

    const flowInitialized0 = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    // Deploying flow 1
    ({ flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    ));

    await assertError(
      async () =>
        await flow
          .connect(you)
          .previewFlow(flowInitialized0[0].evaluable, [1234], []),
      "UnregisteredFlow",
      "Did not error when an unregistered flow is being evaluated"
    );

    await assertError(
      async () =>
        await flow
          .connect(you)
          .callStatic.flow(flowInitialized0[0].evaluable, [1234], []),
      "UnregisteredFlow",
      "Did not error when an unregistered flow is being evaluated"
    );

    await assertError(
      async () =>
        await flow.connect(you).flow(flowInitialized0[0].evaluable, [1234], []),
      "UnregisteredFlow",
      "Did not error when an unregistered flow is being evaluated"
    );
  });

  it("should not be able to access values set in a flow across different flows", async () => {
    const signers = await ethers.getSigners();
    const [deployer, you] = signers;

    const erc20In = (await basicDeploy("ReserveToken18", {})) as ReserveToken18;
    await erc20In.initialize();

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
      erc721: [],
      erc1155: [],
    };

    // Sample key
    const key = 1337;
    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowTransfer.erc20[0].token,
      flowTransfer.erc20[0].amount,
      key,
    ];

    const SENTINEL = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 0));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 3));
    const KEY = () =>
      op(Opcode.read_memory, memoryOperand(MemoryType.Constant, 4));

    const sourceFlowIOA = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 END
      SENTINEL(), // ERC20 END
      FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT(),
      SENTINEL(), // NATIVE SKIP

      // Setting a value
      KEY(), // k_
      op(Opcode.block_timestamp), // v_
      op(Opcode.set),
    ]);

    const sourceFlowIOB = concat([
      // Getting the value set in flowA
      KEY(), // k_
      op(Opcode.get), // Getting a value with the same key set in flowA
      op(Opcode.is_zero),
      op(Opcode.ensure, 1), // Ensures that the value is not set

      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 END
      SENTINEL(), // ERC20 END
      FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN(),
      YOU(),
      ME(),
      FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT(),
      SENTINEL(), // NATIVE SKIP
    ]);

    const flowConfigStruct: FlowConfig = {
      flows: [
        { sources: [sourceFlowIOA], constants },
        { sources: [sourceFlowIOB], constants },
      ],
    };

    const { flow } = await deployFlowClone(
      deployer,
      cloneFactory,
      implementation,
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const me = flow;

    // prepare input ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    const flowStruct = await flow
      .connect(you)
      .previewFlow(flowInitialized[0].evaluable, [1234], []);

    await flow
      .connect(you)
      .callStatic.flow(flowInitialized[0].evaluable, [1234], []);

    compareStructs(flowStruct, fillEmptyAddress(flowTransfer, flow.address));

    const _txFlow = await flow
      .connect(you)
      .flow(flowInitialized[0].evaluable, [1234], []);

    // Transfer flowB

    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);
    await flow.connect(you).flow(flowInitialized[1].evaluable, [1234], []);

    // check input ERC20 affected balances correctly
    const me20BalanceIn = await erc20In.balanceOf(me.address);
    const you20BalanceIn = await erc20In.balanceOf(you.address);

    assert(
      me20BalanceIn.eq(
        ((await flowTransfer.erc20[0].amount) as BigNumber).mul(2)
      )
    );
    assert(you20BalanceIn.isZero());
  });
});
