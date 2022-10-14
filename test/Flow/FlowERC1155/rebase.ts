import { assert } from "chai";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowERC1155Factory, FlowIntegrity } from "../../../typechain";
import {
  FlowERC1155ConfigStruct,
  FlowTransferStruct,
  SaveVMStateEvent,
} from "../../../typechain/contracts/flow/erc1155/FlowERC1155";
import {
  eighteenZeros,
  ONE,
  sixZeros,
} from "../../../utils/constants/bigNumber";
import {
  RAIN_FLOW_ERC1155_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { flowERC1155Deploy } from "../../../utils/deploy/flow/flow";
import { getEvents } from "../../../utils/events";
import { createEmptyBlock, getBlockNumber } from "../../../utils/hardhat";
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { memoryOperand, MemoryType, op } from "../../../utils/rainvm/vm";

const Opcode = AllStandardOps;

describe("FlowERC1155 rebase tests", async function () {
  let integrity: FlowIntegrity;
  let flowERC1155Factory: FlowERC1155Factory;
  const ME = () => op(Opcode.THIS_ADDRESS);
  const YOU = () => op(Opcode.SENDER);

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

    const tokenId = 0;
    const tokenAmount = ethers.BigNumber.from(2 + eighteenZeros);

    const constantsMint = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      rebaseRatio,
      1,
      tokenId,
      tokenAmount,
      flowTransferMint.native[0].amount,
      flowTransferMint.native[1].amount,
      2,
    ];

    const constantsBurn = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      rebaseRatio,
      1,
      tokenId,
      tokenAmount,
      flowTransferBurn.native[0].amount,
      flowTransferBurn.native[1].amount,
      2,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));

    const TOKEN_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const TOKEN_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));

    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));

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
      SENTINEL_1155(), // BURN SKIP
      SENTINEL_1155(), // MINT END
      YOU(),
      TOKEN_ID(), // mint
      TOKEN_AMOUNT(), // mint
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
      SENTINEL_1155(), // BURN END
      YOU(),
      TOKEN_ID(), // mint
      TOKEN_AMOUNT(), // mint
      SENTINEL_1155(), // MINT SKIP
    ]);

    const sources = [REBASE_RATIO(), CAN_TRANSFER()];

    const stateConfigStruct: FlowERC1155ConfigStruct = {
      uri: "F1155",
      vmStateConfig: {
        sources,
        constants: constantsMint, // only needed for REBASE_RATIO and CAN_TRANSFER, so could also be `constantsBurn` and produce same result
      },
      flows: [
        { sources: [CAN_FLOW(), sourceFlowIOMint], constants: constantsMint },
        { sources: [CAN_FLOW(), sourceFlowIOBurn], constants: constantsBurn },
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

    const me = flow;

    // -- PERFORM MINT --

    const txPreviewFlowMint = await flow
      .connect(you)
      .previewFlow(mintFlowId, 1234);

    const previewMintAmount = txPreviewFlowMint.mints[0].amount;

    assert(
      previewMintAmount.eq(tokenAmount.mul(rebaseRatio).div(ONE)),
      `wrong previewFlow mint amount
      expected  ${tokenAmount.mul(rebaseRatio).div(ONE)}
      got       ${previewMintAmount}`
    );

    const txFlowMint = await flow.connect(you).flow(mintFlowId, 1234, {
      value: ethers.BigNumber.from(flowTransferMint.native[0].amount),
    });

    const you1155Balance1 = await flow.balanceOf(you.address, tokenId);

    assert(
      previewMintAmount.eq(you1155Balance1),
      `wrong flow mint amount
      previewFlow ${previewMintAmount}
      flow        ${you1155Balance1}`
    );

    // -- PERFORM BURN --

    const txPreviewFlowBurn = await flow
      .connect(you)
      .previewFlow(burnFlowId, 1234);

    const previewBurnAmount = txPreviewFlowMint.burns[0].amount;

    assert(
      previewBurnAmount.eq(tokenAmount.mul(rebaseRatio).div(ONE)),
      `wrong previewFlow burn amount
      expected  ${tokenAmount.mul(rebaseRatio).div(ONE)}
      got       ${previewBurnAmount}`
    );

    const txFlowBurn = await flow.connect(you).flow(burnFlowId, 1234);

    const you1155Balance2 = await flow.balanceOf(you.address, tokenId);

    assert(
      you1155Balance2.isZero(),
      `wrong flow burn amount
      expected  0
      got       ${you1155Balance2}`
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

    const tokenId = 0;
    const tokenAmount = ethers.BigNumber.from(2 + eighteenZeros);

    const constantsMint = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      rebaseRatio,
      1,
      tokenId,
      tokenAmount,
      flowTransferMint.native[0].amount,
      flowTransferMint.native[1].amount,
      2,
    ];

    const constantsBurn = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      rebaseRatio,
      1,
      tokenId,
      tokenAmount,
      flowTransferBurn.native[0].amount,
      flowTransferBurn.native[1].amount,
      2,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));

    const TOKEN_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const TOKEN_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));

    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));

    const TWO = () => op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));

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
      SENTINEL_1155(), // BURN SKIP
      SENTINEL_1155(), // MINT END
      YOU(),
      TOKEN_ID(), // mint
      TOKEN_AMOUNT(), // mint
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
      SENTINEL_1155(), // BURN END
      YOU(),
      TOKEN_ID(), // mint
      TOKEN_AMOUNT(), // mint
      SENTINEL_1155(), // MINT SKIP
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

    const stateConfigStruct: FlowERC1155ConfigStruct = {
      uri: "F1155",
      vmStateConfig: {
        sources,
        constants: constantsMint, // only needed for REBASE_RATIO and CAN_TRANSFER, so could also be `constantsBurn` and produce same result
      },
      flows: [
        { sources: [CAN_FLOW(), sourceFlowIOMint], constants: constantsMint },
        { sources: [CAN_FLOW(), sourceFlowIOBurn], constants: constantsBurn },
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

    const me = flow;

    const isOdd0 = (await getBlockNumber()) % 2;

    if (!isOdd0) createEmptyBlock(); // make odd

    // -- PERFORM MINTS --

    const txFlowMint1 = await flow.connect(you).flow(mintFlowId, 1234, {
      value: ethers.BigNumber.from(flowTransferMint.native[0].amount),
    });

    const me1155Balance1 = await flow.balanceOf(me.address, tokenId);
    const you1155Balance1 = await flow.balanceOf(you.address, tokenId);

    const blockNumber1 = txFlowMint1.blockNumber;
    const isOdd1 = blockNumber1 % 2;
    const rebaseRatio1 = isOdd1 ? rebaseRatio.div(2) : rebaseRatio;

    console.log({
      me1155Balance1,
      you1155Balance1,
      blockNumber1,
      isOdd1,
      rebaseRatio1,
    });

    assert(me1155Balance1.isZero());
    assert(
      you1155Balance1.eq(tokenAmount.mul(rebaseRatio1).div(ONE)),
      `wrong sender balance minted
      expected  ${tokenAmount.mul(rebaseRatio1).div(ONE)}
      got       ${you1155Balance1}`
    );

    const txFlowMint2 = await flow.connect(you).flow(mintFlowId, 1234, {
      value: ethers.BigNumber.from(flowTransferMint.native[0].amount),
    });

    const me1155Balance2 = await flow.balanceOf(me.address, tokenId);
    const you1155Balance2 = await flow.balanceOf(you.address, tokenId);

    const blockNumber2 = txFlowMint2.blockNumber;
    const isOdd2 = blockNumber2 % 2;
    const rebaseRatio2 = isOdd2 ? rebaseRatio.div(2) : rebaseRatio;

    console.log({
      me1155Balance2,
      you1155Balance2,
      blockNumber2,
      isOdd2,
      rebaseRatio2,
    });

    assert(me1155Balance2.isZero());
    assert(
      you1155Balance2.eq(
        you1155Balance1.add(tokenAmount.mul(rebaseRatio2).div(ONE))
      ),
      `wrong sender balance minted
      expected  ${you1155Balance1.add(tokenAmount.mul(rebaseRatio2).div(ONE))}
      got       ${you1155Balance2}`
    );

    // -- PERFORM BURNS --

    const txFlowBurn1 = await flow.connect(you).flow(burnFlowId, 1234);

    const me1155Balance3 = await flow.balanceOf(me.address, tokenId);
    const you1155Balance3 = await flow.balanceOf(you.address, tokenId);

    const blockNumber3 = txFlowBurn1.blockNumber;
    const isOdd3 = blockNumber3 % 2;
    const rebaseRatio3 = isOdd3 ? rebaseRatio.div(2) : rebaseRatio;

    console.log({
      me1155Balance3,
      you1155Balance3,
      blockNumber3,
      isOdd3,
      rebaseRatio3,
    });

    const txFlowBurn2 = await flow.connect(you).flow(burnFlowId, 1234);

    const me1155Balance4 = await flow.balanceOf(me.address, tokenId);
    const you1155Balance4 = await flow.balanceOf(you.address, tokenId);

    const blockNumber4 = txFlowBurn2.blockNumber;
    const isOdd4 = blockNumber4 % 2;
    const rebaseRatio4 = isOdd4 ? rebaseRatio.div(2) : rebaseRatio;

    console.log({
      me1155Balance4,
      you1155Balance4,
      blockNumber4,
      isOdd4,
      rebaseRatio4,
    });

    assert(me1155Balance4.isZero());
    assert(
      you1155Balance4.isZero(),
      `wrong sender balance burned
      expected  0
      got       ${you1155Balance4}`
    );
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

    const tokenId = 0;
    const tokenAmount = ethers.BigNumber.from(2 + eighteenZeros);

    const constantsMint = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      rebaseRatio,
      1,
      tokenId,
      tokenAmount,
      flowTransferMint.native[0].amount,
      flowTransferMint.native[1].amount,
      2,
    ];

    const constantsBurn = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC1155_SENTINEL,
      rebaseRatio,
      1,
      tokenId,
      tokenAmount,
      flowTransferBurn.native[0].amount,
      flowTransferBurn.native[1].amount,
      2,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_1155 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const REBASE_RATIO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const CAN_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));

    const TOKEN_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const TOKEN_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));

    const FLOWTRANSFER_YOU_TO_ME_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    const FLOWTRANSFER_ME_TO_YOU_NATIVE_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 7));

    const TWO = () => op(Opcode.STATE, memoryOperand(MemoryType.Constant, 8));

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
      SENTINEL_1155(), // BURN SKIP
      SENTINEL_1155(), // MINT END
      YOU(),
      TOKEN_ID(), // mint
      TOKEN_AMOUNT(), // mint
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
      SENTINEL_1155(), // BURN END
      YOU(),
      TOKEN_ID(), // mint
      TOKEN_AMOUNT(), // mint
      SENTINEL_1155(), // MINT SKIP
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

    const stateConfigStruct: FlowERC1155ConfigStruct = {
      uri: "F1155",
      vmStateConfig: {
        sources,
        constants: constantsMint, // only needed for REBASE_RATIO and CAN_TRANSFER, so could also be `constantsBurn` and produce same result
      },
      flows: [
        { sources: [CAN_FLOW(), sourceFlowIOMint], constants: constantsMint },
        { sources: [CAN_FLOW(), sourceFlowIOBurn], constants: constantsBurn },
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

    const me = flow;

    const isOdd0 = (await getBlockNumber()) % 2;

    if (isOdd0) createEmptyBlock(); // make even

    // -- PERFORM MINTS --

    const txFlowMint1 = await flow.connect(you).flow(mintFlowId, 1234, {
      value: ethers.BigNumber.from(flowTransferMint.native[0].amount),
    });

    const me1155Balance1 = await flow.balanceOf(me.address, tokenId);
    const you1155Balance1 = await flow.balanceOf(you.address, tokenId);

    const blockNumber1 = txFlowMint1.blockNumber;
    const isOdd1 = blockNumber1 % 2;
    const rebaseRatio1 = isOdd1 ? rebaseRatio.div(2) : rebaseRatio;

    console.log({
      me1155Balance1,
      you1155Balance1,
      blockNumber1,
      isOdd1,
      rebaseRatio1,
    });

    assert(me1155Balance1.isZero());
    assert(
      you1155Balance1.eq(tokenAmount.mul(rebaseRatio1).div(ONE)),
      `wrong sender balance minted
      expected  ${tokenAmount.mul(rebaseRatio1).div(ONE)}
      got       ${you1155Balance1}`
    );

    const txFlowMint2 = await flow.connect(you).flow(mintFlowId, 1234, {
      value: ethers.BigNumber.from(flowTransferMint.native[0].amount),
    });

    const me1155Balance2 = await flow.balanceOf(me.address, tokenId);
    const you1155Balance2 = await flow.balanceOf(you.address, tokenId);

    const blockNumber2 = txFlowMint2.blockNumber;
    const isOdd2 = blockNumber2 % 2;
    const rebaseRatio2 = isOdd2 ? rebaseRatio.div(2) : rebaseRatio;

    console.log({
      me1155Balance2,
      you1155Balance2,
      blockNumber2,
      isOdd2,
      rebaseRatio2,
    });

    assert(me1155Balance2.isZero());
    assert(
      you1155Balance2.eq(
        you1155Balance1.add(tokenAmount.mul(rebaseRatio2).div(ONE))
      ),
      `wrong sender balance minted
      expected  ${you1155Balance1.add(tokenAmount.mul(rebaseRatio2).div(ONE))}
      got       ${you1155Balance2}`
    );

    // -- PERFORM BURNS --

    const txFlowBurn1 = await flow.connect(you).flow(burnFlowId, 1234);

    const me1155Balance3 = await flow.balanceOf(me.address, tokenId);
    const you1155Balance3 = await flow.balanceOf(you.address, tokenId);

    const blockNumber3 = txFlowBurn1.blockNumber;
    const isOdd3 = blockNumber3 % 2;
    const rebaseRatio3 = isOdd3 ? rebaseRatio.div(2) : rebaseRatio;

    console.log({
      me1155Balance3,
      you1155Balance3,
      blockNumber3,
      isOdd3,
      rebaseRatio3,
    });

    const txFlowBurn2 = await flow.connect(you).flow(burnFlowId, 1234);

    const me1155Balance4 = await flow.balanceOf(me.address, tokenId);
    const you1155Balance4 = await flow.balanceOf(you.address, tokenId);

    const blockNumber4 = txFlowBurn2.blockNumber;
    const isOdd4 = blockNumber4 % 2;
    const rebaseRatio4 = isOdd4 ? rebaseRatio.div(2) : rebaseRatio;

    console.log({
      me1155Balance4,
      you1155Balance4,
      blockNumber4,
      isOdd4,
      rebaseRatio4,
    });

    assert(me1155Balance4.isZero());
    assert(
      you1155Balance4.isZero(),
      `wrong sender balance burned
      expected  0
      got       ${you1155Balance4}`
    );
  });
});
