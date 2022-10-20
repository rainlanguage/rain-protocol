import { assert } from "chai";
import { BigNumber } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  FlowERC20Factory,
  FlowIntegrity,
  ReserveToken18,
  ReserveTokenERC1155,
  ReserveTokenERC721,
} from "../../../typechain";
import { FlowTransferStruct } from "../../../typechain/contracts/flow/erc1155/FlowERC1155";
import {
  FlowERC20ConfigStruct,
  FlowERC20IOStruct,
  SaveInterpreterStateEvent,
} from "../../../typechain/contracts/flow/erc20/FlowERC20";
import { eighteenZeros, sixZeros } from "../../../utils/constants/bigNumber";
import {
  RAIN_FLOW_ERC20_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { flowERC20Deploy } from "../../../utils/deploy/flow/deploy";
import { flowERC20FactoryDeploy } from "../../../utils/deploy/flow/flowERC20/flowERC20Factory/deploy";
import { flowIntegrityDeploy } from "../../../utils/deploy/flow/interpreter/integrity/flowIntegrity/deploy";
import { getEvents } from "../../../utils/events";
import { fillEmptyAddressERC20 } from "../../../utils/flow";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../utils/test/assertError";
import { compareStructs } from "../../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe("FlowERC20 flow tests", async function () {
  let flowERC20Factory: FlowERC20Factory;
  const ME = () => op(Opcode.THIS_ADDRESS);
  const YOU = () => op(Opcode.SENDER);

  before(async () => {
    flowERC20Factory = await flowERC20FactoryDeploy();
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

    const flowERC20IO: FlowERC20IOStruct = {
      mints: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(2),
        },
      ],
      burns: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(0),
        },
      ],
      flow: flowTransfer,
    };

    const mint = flowERC20IO.mints[0].amount;
    const burn = flowERC20IO.burns[0].amount;

    const constantsCanTransfer = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      mint,
      burn,
      1,
    ];

    const constantsCannotTransfer = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      mint,
      burn,
      0,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_ERC20 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const MINT_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const BURN_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE SKIP
      SENTINEL_ERC20(), // BURN END
      YOU(),
      BURN_AMOUNT(),
      SENTINEL_ERC20(), // MINT END
      YOU(),
      MINT_AMOUNT(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStructCanTransfer: FlowERC20ConfigStruct = {
      name: "FlowERC20",
      symbol: "F20",
      interpreterStateConfig: {
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
    const stateConfigStructCannotTransfer: FlowERC20ConfigStruct = {
      name: "FlowERC20",
      symbol: "F20",
      interpreterStateConfig: {
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

    const flowCanTransfer = await flowERC20Deploy(
      deployer,
      flowERC20Factory,
      stateConfigStructCanTransfer
    );
    const flowCannotTransfer = await flowERC20Deploy(
      deployer,
      flowERC20Factory,
      stateConfigStructCannotTransfer
    );

    const flowStatesCanTransfer = (await getEvents(
      flowCanTransfer.deployTransaction,
      "SaveInterpreterState",
      flowCanTransfer
    )) as SaveInterpreterStateEvent["args"][];
    const flowStatesCannotTransfer = (await getEvents(
      flowCannotTransfer.deployTransaction,
      "SaveInterpreterState",
      flowCannotTransfer
    )) as SaveInterpreterStateEvent["args"][];

    const signerReceiver = signers[2];

    const _txFlowCanTransfer = await flowCanTransfer
      .connect(you)
      .flow(flowStatesCanTransfer[1].id, 1234);

    const _txFlowCannotTransfer = await flowCannotTransfer
      .connect(you)
      .flow(flowStatesCannotTransfer[1].id, 1234);

    await flowCanTransfer.connect(you).transfer(signerReceiver.address, mint);

    await assertError(
      async () =>
        await flowCannotTransfer
          .connect(you)
          .transfer(signerReceiver.address, mint),
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
    const mintMint = ethers.BigNumber.from(2 + eighteenZeros);
    const burnMint = ethers.BigNumber.from(0);

    const flowERC20IOMint: FlowERC20IOStruct = {
      mints: [
        {
          account: you.address,
          amount: mintMint,
        },
      ],
      burns: [
        {
          account: you.address,
          amount: burnMint,
        },
      ],
      flow: flowTransferMint,
    };

    // for burn flow (redeem erc20 for native)
    const mintBurn = ethers.BigNumber.from(0);
    const burnBurn = ethers.BigNumber.from(2 + eighteenZeros);

    const flowERC20IOBurn: FlowERC20IOStruct = {
      mints: [
        {
          account: you.address,
          amount: mintBurn,
        },
      ],
      burns: [
        {
          account: you.address,
          amount: burnBurn,
        },
      ],
      flow: flowTransferBurn,
    };

    const constantsMint = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      mintMint,
      burnMint,
      flowTransferMint.native[0].amount,
      flowTransferMint.native[1].amount,
    ];

    const constantsBurn = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      mintBurn,
      burnBurn,
      flowTransferBurn.native[0].amount,
      flowTransferBurn.native[1].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_ERC20 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const MINT_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const BURN_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));

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
      SENTINEL_ERC20(), // BURN END
      YOU(),
      BURN_AMOUNT(),
      SENTINEL_ERC20(), // MINT END
      YOU(),
      MINT_AMOUNT(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: FlowERC20ConfigStruct = {
      name: "FlowERC20",
      symbol: "F20",
      interpreterStateConfig: {
        sources,
        constants: constantsMint, // only needed for REBASE_RATIO and CAN_TRANSFER, so could also be `constantsBurn` and produce same result
      },
      flows: [
        { sources: [CAN_FLOW(), sourceFlowIO], constants: constantsMint },
        { sources: [CAN_FLOW(), sourceFlowIO], constants: constantsBurn },
      ],
    };

    const flow = await flowERC20Deploy(
      deployer,
      flowERC20Factory,
      stateConfigStruct
    );

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveInterpreterState",
      flow
    )) as SaveInterpreterStateEvent["args"][];

    const mintFlowId = flowStates[1].id;
    const burnFlowId = flowStates[2].id;

    const me = flow;

    const totalSupply0 = await flow.totalSupply();
    assert(
      totalSupply0.isZero(),
      "should not have minted any tokens before calling flow that mints"
    );

    // prepare input Ether
    const youEtherBalance0 = await ethers.provider.getBalance(you.address);

    // -- PERFORM MINT --

    const flowStructMint = await flow
      .connect(you)
      .callStatic.flow(mintFlowId, 1234, {
        value: ethers.BigNumber.from(flowTransferMint.native[0].amount),
      });

    compareStructs(
      flowStructMint,
      fillEmptyAddressERC20(flowERC20IOMint, flow.address)
    );

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

    const expectedMeEtherBalance1 = flowTransferMint.native[0]
      .amount as BigNumber;

    assert(
      meEtherBalance1.eq(expectedMeEtherBalance1),
      `wrong balance for me (flow contract)
      expected  ${expectedMeEtherBalance1}
      got       ${meEtherBalance1}`
    );

    const me20Balance1 = await flow.balanceOf(me.address);
    const you20Balance1 = await flow.balanceOf(you.address);
    const totalSupply1 = await flow.totalSupply();

    assert(me20Balance1.isZero());
    assert(
      you20Balance1.eq(mintMint),
      `wrong sender balance minted
      expected  ${mintMint}
      got       ${you20Balance1}`
    );
    assert(totalSupply1.eq(mintMint));

    // -- PERFORM BURN --

    const flowStructBurn = await flow
      .connect(you)
      .callStatic.flow(burnFlowId, 1234);

    compareStructs(
      flowStructBurn,
      fillEmptyAddressERC20(flowERC20IOBurn, flow.address)
    );

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
    const totalSupply2 = await flow.totalSupply();

    assert(me20Balance2.isZero());
    assert(
      you20Balance2.isZero(),
      `wrong sender balance burned
      expected  0
      got       ${you20Balance2}`
    );
    assert(totalSupply2.isZero());
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
        },
      ],
    };

    const flowERC20IO: FlowERC20IOStruct = {
      mints: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(20 + eighteenZeros),
        },
      ],
      burns: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(10 + eighteenZeros),
        },
      ],
      flow: flowTransfer,
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      flowERC20IO.mints[0].amount,
      flowERC20IO.burns[0].amount,
      flowTransfer.native[0].amount,
      flowTransfer.native[1].amount,
      flowTransfer.erc1155[0].token,
      flowTransfer.erc1155[0].id,
      flowTransfer.erc1155[0].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_ERC20 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const MINT_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const BURN_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));

    const FLOWTRANSFER_YOU_TO_ME_ERC1155_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 9));

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
      SENTINEL_ERC20(), // BURN END
      YOU(),
      BURN_AMOUNT(),
      SENTINEL_ERC20(), // MINT END
      YOU(),
      MINT_AMOUNT(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: FlowERC20ConfigStruct = {
      name: "FlowERC20",
      symbol: "F20",
      interpreterStateConfig: {
        sources,
        constants,
      },
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    };

    const flow = await flowERC20Deploy(
      deployer,
      flowERC20Factory,
      stateConfigStruct
    );

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveInterpreterState",
      flow
    )) as SaveInterpreterStateEvent["args"][];

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

    compareStructs(
      flowStruct,
      fillEmptyAddressERC20(flowERC20IO, flow.address)
    );

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
          from: "", // Contract address
          to: you.address,
        },
      ],
    };

    const flowERC20IO: FlowERC20IOStruct = {
      mints: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(20 + eighteenZeros),
        },
      ],
      burns: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(10 + eighteenZeros),
        },
      ],
      flow: flowTransfer,
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      flowERC20IO.mints[0].amount,
      flowERC20IO.burns[0].amount,
      flowTransfer.erc721[0].token,
      flowTransfer.erc721[0].id,
      flowTransfer.erc1155[0].token,
      flowTransfer.erc1155[0].id,
      flowTransfer.erc1155[0].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_ERC20 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const MINT_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const BURN_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_YOU_TO_ME_ERC721_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));

    const FLOWTRANSFER_ME_TO_YOU_ERC1155_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 9));

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
      SENTINEL_ERC20(), // BURN END
      YOU(),
      BURN_AMOUNT(),
      SENTINEL_ERC20(), // MINT END
      YOU(),
      MINT_AMOUNT(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: FlowERC20ConfigStruct = {
      name: "FlowERC20",
      symbol: "F20",
      interpreterStateConfig: {
        sources,
        constants,
      },
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    };

    const flow = await flowERC20Deploy(
      deployer,
      flowERC20Factory,
      stateConfigStruct
    );

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveInterpreterState",
      flow
    )) as SaveInterpreterStateEvent["args"][];

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

    compareStructs(
      flowStruct,
      fillEmptyAddressERC20(flowERC20IO, flow.address)
    );

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
          from: "", // Contract address
          to: you.address,
          id: 0,
        },
      ],
      erc1155: [],
    };

    const flowERC20IO: FlowERC20IOStruct = {
      mints: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(20 + eighteenZeros),
        },
      ],
      burns: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(10 + eighteenZeros),
        },
      ],
      flow: flowTransfer,
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      flowERC20IO.mints[0].amount,
      flowERC20IO.burns[0].amount,
      flowTransfer.erc20[0].token,
      flowTransfer.erc20[0].amount,
      flowTransfer.erc721[0].token,
      flowTransfer.erc721[0].id,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_ERC20 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const MINT_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const BURN_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));

    const FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));

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
      SENTINEL_ERC20(), // BURN END
      YOU(),
      BURN_AMOUNT(),
      SENTINEL_ERC20(), // MINT END
      YOU(),
      MINT_AMOUNT(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: FlowERC20ConfigStruct = {
      name: "FlowERC20",
      symbol: "F20",
      interpreterStateConfig: {
        sources,
        constants,
      },
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    };

    const flow = await flowERC20Deploy(
      deployer,
      flowERC20Factory,
      stateConfigStruct
    );

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveInterpreterState",
      flow
    )) as SaveInterpreterStateEvent["args"][];

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
      .callStatic.flow(flowStates[1].id, 1234);

    compareStructs(
      flowStruct,
      fillEmptyAddressERC20(flowERC20IO, flow.address)
    );

    const _txFlow = await flow.connect(you).flow(flowStates[1].id, 1234);

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

    const flowERC20IO: FlowERC20IOStruct = {
      mints: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(20 + eighteenZeros),
        },
      ],
      burns: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(10 + eighteenZeros),
        },
      ],
      flow: flowTransfer,
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      flowERC20IO.mints[0].amount,
      flowERC20IO.burns[0].amount,
      flowTransfer.native[0].amount,
      flowTransfer.erc20[0].token,
      flowTransfer.erc20[0].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_ERC20 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const MINT_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const BURN_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));

    const FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));

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
      SENTINEL_ERC20(), // BURN END
      YOU(),
      BURN_AMOUNT(),
      SENTINEL_ERC20(), // MINT END
      YOU(),
      MINT_AMOUNT(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: FlowERC20ConfigStruct = {
      name: "FlowERC20",
      symbol: "F20",
      interpreterStateConfig: {
        sources,
        constants,
      },
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    };

    const flow = await flowERC20Deploy(
      deployer,
      flowERC20Factory,
      stateConfigStruct
    );

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveInterpreterState",
      flow
    )) as SaveInterpreterStateEvent["args"][];

    const me = flow;

    // prepare output ERC20
    await erc20Out.transfer(me.address, flowTransfer.erc20[0].amount);

    // prepare input Ether
    const youBalance0 = await ethers.provider.getBalance(you.address);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].id, 1234, {
        value: ethers.BigNumber.from(flowTransfer.native[0].amount),
      });

    compareStructs(flowStruct, fillEmptyAddressERC20(flowERC20IO, me.address));

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

    // check output ERC20 affected balances correctly
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
          from: "", // Contract address
          to: you.address,
          token: erc1155Out.address,
          id: 0,
          amount: ethers.BigNumber.from(2 + sixZeros),
        },
      ],
    };

    const flowERC20IO: FlowERC20IOStruct = {
      mints: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(20 + eighteenZeros),
        },
      ],
      burns: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(10 + eighteenZeros),
        },
      ],
      flow: flowTransfer,
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      flowERC20IO.mints[0].amount,
      flowERC20IO.burns[0].amount,
      flowTransfer.erc1155[0].token,
      flowTransfer.erc1155[0].id,
      flowTransfer.erc1155[0].amount,
      flowTransfer.erc1155[1].token,
      flowTransfer.erc1155[1].id,
      flowTransfer.erc1155[1].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_ERC20 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const MINT_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const BURN_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_YOU_TO_ME_ERC1155_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_YOU_TO_ME_ERC1155_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));

    const FLOWTRANSFER_ME_TO_YOU_ERC1155_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 9));
    const FLOWTRANSFER_ME_TO_YOU_ERC1155_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 10));

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
      SENTINEL_ERC20(), // BURN END
      YOU(),
      BURN_AMOUNT(),
      SENTINEL_ERC20(), // MINT END
      YOU(),
      MINT_AMOUNT(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: FlowERC20ConfigStruct = {
      name: "FlowERC20",
      symbol: "F20",
      interpreterStateConfig: {
        sources,
        constants,
      },
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    };

    const flow = await flowERC20Deploy(
      deployer,
      flowERC20Factory,
      stateConfigStruct
    );

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveInterpreterState",
      flow
    )) as SaveInterpreterStateEvent["args"][];

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

    compareStructs(flowStruct, fillEmptyAddressERC20(flowERC20IO, me.address));

    const _txFlow = await flow.connect(you).flow(flowStates[1].id, 1234);

    const meBalanceIn = await erc1155In.balanceOf(me.address, 0);
    const meBalanceOut = await erc1155Out.balanceOf(me.address, 0);
    const youBalanceIn = await erc1155In.balanceOf(you.address, 0);
    const youBalanceOut = await erc1155Out.balanceOf(you.address, 0);

    assert(
      meBalanceIn.eq(await flowERC20IO.flow.erc1155[0].amount),
      `wrong balance for me (flow contract)
      expected  ${flowERC20IO.flow.erc1155[0].amount}
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
      youBalanceOut.eq(await flowERC20IO.flow.erc1155[1].amount),
      `wrong balance for you (signer1 contract)
      expected  ${flowERC20IO.flow.erc1155[1].amount}
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

    const flowERC20IO: FlowERC20IOStruct = {
      mints: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(20 + eighteenZeros),
        },
      ],
      burns: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(10 + eighteenZeros),
        },
      ],
      flow: flowTransfer,
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      flowERC20IO.mints[0].amount,
      flowERC20IO.burns[0].amount,
      flowTransfer.erc721[0].token,
      flowTransfer.erc721[0].id,
      flowTransfer.erc721[1].token,
      flowTransfer.erc721[1].id,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_ERC20 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const MINT_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const BURN_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_YOU_TO_ME_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_YOU_TO_ME_ERC721_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));

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
      SENTINEL_ERC20(), // BURN END
      YOU(),
      BURN_AMOUNT(),
      SENTINEL_ERC20(), // MINT END
      YOU(),
      MINT_AMOUNT(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: FlowERC20ConfigStruct = {
      name: "FlowERC20",
      symbol: "F20",
      interpreterStateConfig: {
        sources,
        constants,
      },
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    };

    const flow = await flowERC20Deploy(
      deployer,
      flowERC20Factory,
      stateConfigStruct
    );

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveInterpreterState",
      flow
    )) as SaveInterpreterStateEvent["args"][];

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

    compareStructs(flowStruct, fillEmptyAddressERC20(flowERC20IO, me.address));

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

    const flowERC20IO: FlowERC20IOStruct = {
      mints: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(20 + eighteenZeros),
        },
      ],
      burns: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(10 + eighteenZeros),
        },
      ],
      flow: flowTransfer,
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      flowERC20IO.mints[0].amount,
      flowERC20IO.burns[0].amount,
      flowTransfer.erc20[0].token,
      flowTransfer.erc20[0].amount,
      flowTransfer.erc20[1].token,
      flowTransfer.erc20[1].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_ERC20 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const MINT_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const BURN_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));

    const FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));

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
      SENTINEL_ERC20(), // BURN END
      YOU(),
      BURN_AMOUNT(),
      SENTINEL_ERC20(), // MINT END
      YOU(),
      MINT_AMOUNT(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: FlowERC20ConfigStruct = {
      name: "FlowERC20",
      symbol: "F20",
      interpreterStateConfig: {
        sources,
        constants,
      },
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    };

    const flow = await flowERC20Deploy(
      deployer,
      flowERC20Factory,
      stateConfigStruct
    );

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveInterpreterState",
      flow
    )) as SaveInterpreterStateEvent["args"][];

    const me = flow;

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].id, 1234);

    compareStructs(flowStruct, fillEmptyAddressERC20(flowERC20IO, me.address));

    const _txFlow = await flow.connect(you).flow(flowStates[1].id, 1234);

    const meBalanceIn = await erc20In.balanceOf(me.address);
    const meBalanceOut = await erc20Out.balanceOf(me.address);
    const youBalanceIn = await erc20In.balanceOf(you.address);
    const youBalanceOut = await erc20Out.balanceOf(you.address);

    assert(
      meBalanceIn.eq(await flowERC20IO.flow.erc20[0].amount),
      `wrong balance for me (flow contract)
      expected  ${flowERC20IO.flow.erc20[0].amount}
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
      youBalanceOut.eq(await flowERC20IO.flow.erc20[1].amount),
      `wrong balance for you (signer1 contract)
      expected  ${flowERC20IO.flow.erc20[1].amount}
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

    const flowERC20IO: FlowERC20IOStruct = {
      mints: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(20 + eighteenZeros),
        },
      ],
      burns: [
        {
          account: you.address,
          amount: ethers.BigNumber.from(10 + eighteenZeros),
        },
      ],
      flow: flowTransfer,
    };

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      flowERC20IO.mints[0].amount,
      flowERC20IO.burns[0].amount,
      flowTransfer.native[0].amount,
      flowTransfer.native[1].amount,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_ERC20 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const MINT_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const BURN_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));

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
      SENTINEL_ERC20(), // BURN END
      YOU(),
      BURN_AMOUNT(),
      SENTINEL_ERC20(), // MINT END
      YOU(),
      MINT_AMOUNT(),
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: FlowERC20ConfigStruct = {
      name: "FlowERC20",
      symbol: "F20",
      interpreterStateConfig: {
        sources,
        constants,
      },
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    };

    const flow = await flowERC20Deploy(
      deployer,
      flowERC20Factory,
      stateConfigStruct
    );

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "SaveInterpreterState",
      flow
    )) as SaveInterpreterStateEvent["args"][];

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
      .callStatic.flow(flowStates[1].id, 1234, {
        value: ethers.BigNumber.from(flowTransfer.native[0].amount),
      });

    compareStructs(flowStruct, fillEmptyAddressERC20(flowERC20IO, me.address));

    const txFlow = await flow.connect(you).flow(flowStates[1].id, 1234, {
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

    const constants = [RAIN_FLOW_SENTINEL, RAIN_FLOW_ERC20_SENTINEL, 1];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_ERC20 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE END
      SENTINEL_ERC20(), // BURN END
      SENTINEL_ERC20(), // MINT END
    ]);

    const sources = [CAN_TRANSFER()];

    const stateConfigStruct: FlowERC20ConfigStruct = {
      name: "FlowERC20",
      symbol: "F20",
      interpreterStateConfig: {
        sources,
        constants,
      },
      flows: [{ sources: [CAN_FLOW(), sourceFlowIO], constants }],
    };

    const flow = await flowERC20Deploy(
      deployer,
      flowERC20Factory,
      stateConfigStruct
    );

    await signers[0].sendTransaction({
      to: flow.address,
      value: ethers.BigNumber.from(ethers.BigNumber.from(1 + sixZeros)),
    });
  });
});
