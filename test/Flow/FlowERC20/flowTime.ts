import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  FlowERC20Factory,
} from "../../../typechain/contracts/flow/erc20";

import {
  FlowERC20ConfigStruct,
  SaveInterpreterStateEvent,
} from "../../../typechain/contracts/flow/erc20/FlowERC20";

import{ } from "../../../typechain/contracts/flow/erc20/FlowERC20";

import {
  RAIN_FLOW_ERC20_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { flowERC20Deploy } from "../../../utils/deploy/flow/flowERC20/deploy";
import { getEvents } from "../../../utils/events";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";

import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { flowERC20FactoryDeploy } from "../../../utils/deploy/flow/flowERC20/flowERC20Factory/deploy";
import { assertError } from "../../../utils";

const Opcode = AllStandardOps;

describe("FlowERC20 flow tests", async function () {
  let flowERC20Factory: FlowERC20Factory;

  before(async () => {
    flowERC20Factory = await flowERC20FactoryDeploy();
  });


  it("should flow for lichess", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      (10**(18)).toString(),
      0,
      1,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_ERC20 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    const CAN_SIGN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    
    const ONE = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const ZERO = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
      
    const CHESS_WINNER_ADDRESS = () =>
      op(Opcode.CONTEXT, 0x0100);

    const CANNOT_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    
    const sourceFlow_WIN = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE SKIP
      SENTINEL_ERC20(), // BURN SKIP
      SENTINEL_ERC20(), // MINT END
      CHESS_WINNER_ADDRESS(), // ADDRESS
      ONE(), // MINT AMOUNT
    ]);
    
    const sourceCanFlowWin = concat([
      op(Opcode.CONTEXT, 0x0001),
      ZERO(),
      // op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5)), // ITierV2 contract stake0
      op(Opcode.EQUAL_TO),
    ]);
   
    // WIN FLOW 
    const flow_WIN_ConfigStruct: FlowERC20ConfigStruct = {
      name: "FlowWINERC20",
      symbol: "FWIN20",
      interpreterStateConfig: {
        sources:  [CANNOT_TRANSFER()],
        constants,
      },
      flows: [{ sources: [CAN_SIGN(), sourceCanFlowWin, sourceFlow_WIN], constants }],
    };
    
    const flow_WIN = await flowERC20Deploy(
      deployer,
      flowERC20Factory,
      flow_WIN_ConfigStruct
    );

    const flowStates_WIN = (await getEvents(
      flow_WIN.deployTransaction,
      "SaveInterpreterState",
      flow_WIN
    )) as SaveInterpreterStateEvent["args"][];

    
    // CONTEXT
    // [WINNER_ADDRESS, CHESS_IS_BEATEN, IS_IMPROVED, XP_AMOUNT]
    const isBeatenGrandMaster = true;
    const isImproved = true;
    const xpAmount = 100;
    const context = [you.address, Number(isBeatenGrandMaster), Number(isImproved), xpAmount, flowStates_WIN[1].id];
    const messageHash = ethers.utils.solidityKeccak256(['uint256[]'], [context]);

    const signedContext = {
      signer: you.address,
      signature: you.signMessage(ethers.utils.arrayify(messageHash)),
      context: context
    }

    // Flowing once
    await flow_WIN.connect(you).flow(flowStates_WIN[1].id, 9999, [signedContext]);
    
    // Flowing again with the same ID

    await assertError(
        async () =>
        await flow_WIN.connect(you).flow(flowStates_WIN[1].id, 9999, [signedContext]),
        "CANT_FLOW",
        "Flow for the same id_ is not restricted"
      );

    // // PRINTING VALUES
    // console.log("YOU WIN TOKENS : ", await (await flow_WIN.balanceOf(you.address)).toString());
  });
 
});
