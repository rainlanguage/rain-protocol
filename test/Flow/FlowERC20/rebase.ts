import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowERC20Factory, FlowIntegrity } from "../../../typechain";
import {
  FlowERC20ConfigStruct,
  FlowTransferStruct,
  SaveVMStateEvent,
} from "../../../typechain/contracts/flow/erc20/FlowERC20";
import {
  eighteenZeros,
  ONE,
  sixZeros,
} from "../../../utils/constants/bigNumber";
import {
  RAIN_FLOW_ERC20_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { flowERC20Deploy } from "../../../utils/deploy/flow/flow";
import { getEvents } from "../../../utils/events";
import { createEmptyBlock, getBlockNumber } from "../../../utils/hardhat";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { memoryOperand, MemoryType, op } from "../../../utils/rainvm/vm";

const Opcode = AllStandardOps;

describe("FlowERC20 rebase tests", async function () {
  let integrity: FlowIntegrity;
  let flowERC20Factory: FlowERC20Factory;
  const ME = () => op(Opcode.THIS_ADDRESS);
  const YOU = () => op(Opcode.SENDER);

  before(async () => {
    const integrityFactory = await ethers.getContractFactory("FlowIntegrity");
    integrity = (await integrityFactory.deploy()) as FlowIntegrity;
    await integrity.deployed();

    const flowERC20FactoryFactory = await ethers.getContractFactory(
      "FlowERC20Factory",
      {}
    );
    flowERC20Factory = (await flowERC20FactoryFactory.deploy(
      integrity.address
    )) as FlowERC20Factory;
    await flowERC20Factory.deployed();
  });

  it("mint/burn amounts should be same for previewFlow as for flow", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const rebaseRatio = ONE.mul(3); // 3e18

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

    // for burn flow (redeem erc20 for native)
    const mintBurn = ethers.BigNumber.from(0);
    const burnBurn = ethers.BigNumber.from(2 + eighteenZeros);

    const constantsMint = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      rebaseRatio,
      mintMint,
      burnMint,
      flowTransferMint.native[0].amount,
      flowTransferMint.native[1].amount,
    ];

    const constantsBurn = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      rebaseRatio,
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
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));

    const MINT_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const BURN_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));

    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));

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

    const sources = [REBASE_RATIO(), CAN_TRANSFER()];

    const stateConfigStruct: FlowERC20ConfigStruct = {
      name: "FlowERC20",
      symbol: "F20",
      vmStateConfig: {
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
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

    const mintFlowId = flowStates[1].id;
    const burnFlowId = flowStates[2].id;

    const me = flow;

    const totalSupply0 = await flow.totalSupply();
    assert(
      totalSupply0.isZero(),
      "should not have minted any tokens before calling flow that mints"
    );

    // -- PERFORM MINT --

    const txPreviewFlowMint = await flow
      .connect(you)
      .previewFlow(mintFlowId, 1234);

    const previewMintAmount = txPreviewFlowMint.mints[0].amount;

    assert(
      previewMintAmount.eq(mintMint.mul(rebaseRatio).div(ONE)),
      `wrong previewFlow mint amount
      expected  ${mintMint.mul(rebaseRatio).div(ONE)}
      got       ${previewMintAmount}`
    );

    const txFlowMint = await flow.connect(you).flow(mintFlowId, 1234, {
      value: ethers.BigNumber.from(flowTransferMint.native[0].amount),
    });

    const totalSupply1 = await flow.totalSupply();

    assert(
      previewMintAmount.eq(totalSupply1),
      `wrong flow mint amount
      previewFlow ${previewMintAmount}
      flow        ${totalSupply1}`
    );

    // -- PERFORM BURN --

    const txPreviewFlowBurn = await flow
      .connect(you)
      .previewFlow(burnFlowId, 1234);

    const previewBurnAmount = txPreviewFlowMint.burns[0].amount;

    assert(
      previewBurnAmount.eq(mintBurn.mul(rebaseRatio).div(ONE)),
      `wrong previewFlow burn amount
      expected  ${mintBurn.mul(rebaseRatio).div(ONE)}
      got       ${previewBurnAmount}`
    );

    const txFlowBurn = await flow.connect(you).flow(burnFlowId, 1234);

    const totalSupply2 = await flow.totalSupply();

    assert(
      totalSupply2.isZero(),
      `wrong flow burn amount
      expected  0
      got       ${totalSupply2}`
    );
  });

  it("should rebase mint/burn amounts by a dynamic amount (start on odd block)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const rebaseRatio = ONE; // 1e18

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

    // for burn flow (redeem erc20 for native)
    const mintBurn = ethers.BigNumber.from(0);
    const burnBurn = ethers.BigNumber.from(2 + eighteenZeros);

    const constantsMint = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      rebaseRatio,
      mintMint,
      burnMint,
      flowTransferMint.native[0].amount,
      flowTransferMint.native[1].amount,
      2,
    ];

    const constantsBurn = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      rebaseRatio,
      mintBurn,
      burnBurn,
      flowTransferBurn.native[0].amount,
      flowTransferBurn.native[1].amount,
      2,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_ERC20 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));

    const MINT_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const BURN_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));

    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));

    const TWO = () => op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));

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

    // prettier-ignore
    const sourceRebaseRatio = concat([
          op(Opcode.BLOCK_NUMBER),
          TWO(),
        op(Opcode.MOD, 2),
          REBASE_RATIO(),
          TWO(),
        op(Opcode.DIV, 2),
        REBASE_RATIO(),
      op(Opcode.EAGER_IF), // odd_block_number ? ratio/2 : ratio
    ]);

    const sources = [sourceRebaseRatio, CAN_TRANSFER()];

    const stateConfigStruct: FlowERC20ConfigStruct = {
      name: "FlowERC20",
      symbol: "F20",
      vmStateConfig: {
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
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

    const mintFlowId = flowStates[1].id;
    const burnFlowId = flowStates[2].id;

    const me = flow;

    const totalSupply0 = await flow.totalSupply();
    assert(
      totalSupply0.isZero(),
      "should not have minted any tokens before calling flow that mints"
    );

    const isOdd0 = (await getBlockNumber()) % 2;

    if (!isOdd0) createEmptyBlock(); // make odd

    // -- PERFORM MINTS --

    const txFlowMint1 = await flow.connect(you).flow(mintFlowId, 1234, {
      value: ethers.BigNumber.from(flowTransferMint.native[0].amount),
    });

    const me20Balance1 = await flow.balanceOf(me.address);
    const you20Balance1 = await flow.balanceOf(you.address);
    const totalSupply1 = await flow.totalSupply();

    const blockNumber1 = txFlowMint1.blockNumber;
    const isOdd1 = blockNumber1 % 2;
    const rebaseRatio1 = isOdd1 ? rebaseRatio.div(2) : rebaseRatio;

    console.log({
      me20Balance1,
      you20Balance1,
      totalSupply1,
      blockNumber1,
      isOdd1,
      rebaseRatio1,
    });

    assert(me20Balance1.isZero());
    assert(
      you20Balance1.eq(mintMint.mul(rebaseRatio1).div(ONE)),
      `wrong sender balance minted
      expected  ${mintMint.mul(rebaseRatio1).div(ONE)}
      got       ${you20Balance1}`
    );
    assert(totalSupply1.eq(mintMint.mul(rebaseRatio1).div(ONE)));

    const txFlowMint2 = await flow.connect(you).flow(mintFlowId, 1234, {
      value: ethers.BigNumber.from(flowTransferMint.native[0].amount),
    });

    const me20Balance2 = await flow.balanceOf(me.address);
    const you20Balance2 = await flow.balanceOf(you.address);
    const totalSupply2 = await flow.totalSupply();

    const blockNumber2 = txFlowMint2.blockNumber;
    const isOdd2 = blockNumber2 % 2;
    const rebaseRatio2 = isOdd2 ? rebaseRatio.div(2) : rebaseRatio;

    console.log({
      me20Balance2,
      you20Balance2,
      totalSupply2,
      blockNumber2,
      isOdd2,
      rebaseRatio2,
    });

    assert(me20Balance2.isZero());
    assert(
      you20Balance2.eq(you20Balance1.add(mintMint.mul(rebaseRatio2).div(ONE))),
      `wrong sender balance minted
      expected  ${you20Balance1.add(mintMint.mul(rebaseRatio2).div(ONE))}
      got       ${you20Balance2}`
    );
    assert(
      totalSupply2.eq(totalSupply1.add(mintMint.mul(rebaseRatio2).div(ONE)))
    );

    // -- PERFORM BURNS --

    const txFlowBurn1 = await flow.connect(you).flow(burnFlowId, 1234);

    const me20Balance3 = await flow.balanceOf(me.address);
    const you20Balance3 = await flow.balanceOf(you.address);
    const totalSupply3 = await flow.totalSupply();

    const blockNumber3 = txFlowBurn1.blockNumber;
    const isOdd3 = blockNumber3 % 2;
    const rebaseRatio3 = isOdd3 ? rebaseRatio.div(2) : rebaseRatio;

    console.log({
      me20Balance3,
      you20Balance3,
      totalSupply3,
      blockNumber3,
      isOdd3,
      rebaseRatio3,
    });

    const txFlowBurn2 = await flow.connect(you).flow(burnFlowId, 1234);

    const me20Balance4 = await flow.balanceOf(me.address);
    const you20Balance4 = await flow.balanceOf(you.address);
    const totalSupply4 = await flow.totalSupply();

    const blockNumber4 = txFlowBurn2.blockNumber;
    const isOdd4 = blockNumber4 % 2;
    const rebaseRatio4 = isOdd4 ? rebaseRatio.div(2) : rebaseRatio;

    console.log({
      me20Balance4,
      you20Balance4,
      totalSupply4,
      blockNumber4,
      isOdd4,
      rebaseRatio4,
    });

    assert(me20Balance4.isZero());
    assert(
      you20Balance4.isZero(),
      `wrong sender balance burned
      expected  0
      got       ${you20Balance4}`
    );
    assert(totalSupply4.isZero());
  });

  it("should rebase mint/burn amounts by a dynamic amount (start on even block)", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const rebaseRatio = ONE; // 1e18

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

    // for burn flow (redeem erc20 for native)
    const mintBurn = ethers.BigNumber.from(0);
    const burnBurn = ethers.BigNumber.from(2 + eighteenZeros);

    const constantsMint = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      rebaseRatio,
      mintMint,
      burnMint,
      flowTransferMint.native[0].amount,
      flowTransferMint.native[1].amount,
      2,
    ];

    const constantsBurn = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      1,
      rebaseRatio,
      mintBurn,
      burnBurn,
      flowTransferBurn.native[0].amount,
      flowTransferBurn.native[1].amount,
      2,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_ERC20 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));

    const MINT_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const BURN_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));

    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));

    const TWO = () => op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));

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

    // prettier-ignore
    const sourceRebaseRatio = concat([
          op(Opcode.BLOCK_NUMBER),
          TWO(),
        op(Opcode.MOD, 2),
          REBASE_RATIO(),
          TWO(),
        op(Opcode.DIV, 2),
        REBASE_RATIO(),
      op(Opcode.EAGER_IF), // odd_block_number ? ratio/2 : ratio
    ]);

    const sources = [sourceRebaseRatio, CAN_TRANSFER()];

    const stateConfigStruct: FlowERC20ConfigStruct = {
      name: "FlowERC20",
      symbol: "F20",
      vmStateConfig: {
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
      "SaveVMState",
      flow
    )) as SaveVMStateEvent["args"][];

    const mintFlowId = flowStates[1].id;
    const burnFlowId = flowStates[2].id;

    const me = flow;

    const totalSupply0 = await flow.totalSupply();
    assert(
      totalSupply0.isZero(),
      "should not have minted any tokens before calling flow that mints"
    );

    const isOdd0 = (await getBlockNumber()) % 2;

    if (isOdd0) createEmptyBlock(); // make even

    // -- PERFORM MINTS --

    const txFlowMint1 = await flow.connect(you).flow(mintFlowId, 1234, {
      value: ethers.BigNumber.from(flowTransferMint.native[0].amount),
    });

    const me20Balance1 = await flow.balanceOf(me.address);
    const you20Balance1 = await flow.balanceOf(you.address);
    const totalSupply1 = await flow.totalSupply();

    const blockNumber1 = txFlowMint1.blockNumber;
    const isOdd1 = blockNumber1 % 2;
    const rebaseRatio1 = isOdd1 ? rebaseRatio.div(2) : rebaseRatio;

    console.log({
      me20Balance1,
      you20Balance1,
      totalSupply1,
      blockNumber1,
      isOdd1,
      rebaseRatio1,
    });

    assert(me20Balance1.isZero());
    assert(
      you20Balance1.eq(mintMint.mul(rebaseRatio1).div(ONE)),
      `wrong sender balance minted
      expected  ${mintMint.mul(rebaseRatio1).div(ONE)}
      got       ${you20Balance1}`
    );
    assert(totalSupply1.eq(mintMint.mul(rebaseRatio1).div(ONE)));

    const txFlowMint2 = await flow.connect(you).flow(mintFlowId, 1234, {
      value: ethers.BigNumber.from(flowTransferMint.native[0].amount),
    });

    const me20Balance2 = await flow.balanceOf(me.address);
    const you20Balance2 = await flow.balanceOf(you.address);
    const totalSupply2 = await flow.totalSupply();

    const blockNumber2 = txFlowMint2.blockNumber;
    const isOdd2 = blockNumber2 % 2;
    const rebaseRatio2 = isOdd2 ? rebaseRatio.div(2) : rebaseRatio;

    console.log({
      me20Balance2,
      you20Balance2,
      totalSupply2,
      blockNumber2,
      isOdd2,
      rebaseRatio2,
    });

    assert(me20Balance2.isZero());
    assert(
      you20Balance2.eq(you20Balance1.add(mintMint.mul(rebaseRatio2).div(ONE))),
      `wrong sender balance minted
      expected  ${you20Balance1.add(mintMint.mul(rebaseRatio2).div(ONE))}
      got       ${you20Balance2}`
    );
    assert(
      totalSupply2.eq(totalSupply1.add(mintMint.mul(rebaseRatio2).div(ONE)))
    );

    // -- PERFORM BURNS --

    const txFlowBurn1 = await flow.connect(you).flow(burnFlowId, 1234);

    const me20Balance3 = await flow.balanceOf(me.address);
    const you20Balance3 = await flow.balanceOf(you.address);
    const totalSupply3 = await flow.totalSupply();

    const blockNumber3 = txFlowBurn1.blockNumber;
    const isOdd3 = blockNumber3 % 2;
    const rebaseRatio3 = isOdd3 ? rebaseRatio.div(2) : rebaseRatio;

    console.log({
      me20Balance3,
      you20Balance3,
      totalSupply3,
      blockNumber3,
      isOdd3,
      rebaseRatio3,
    });

    const txFlowBurn2 = await flow.connect(you).flow(burnFlowId, 1234);

    const me20Balance4 = await flow.balanceOf(me.address);
    const you20Balance4 = await flow.balanceOf(you.address);
    const totalSupply4 = await flow.totalSupply();

    const blockNumber4 = txFlowBurn2.blockNumber;
    const isOdd4 = blockNumber4 % 2;
    const rebaseRatio4 = isOdd4 ? rebaseRatio.div(2) : rebaseRatio;

    console.log({
      me20Balance4,
      you20Balance4,
      totalSupply4,
      blockNumber4,
      isOdd4,
      rebaseRatio4,
    });

    assert(me20Balance4.isZero());
    assert(
      you20Balance4.isZero(),
      `wrong sender balance burned
      expected  0
      got       ${you20Balance4}`
    );
    assert(totalSupply4.isZero());
  });
});
