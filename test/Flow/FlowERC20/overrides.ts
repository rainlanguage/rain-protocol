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
import { AllStandardOps } from "../../../utils/rainvm/ops/allStandardOps";
import { memoryOperand, MemoryType, op } from "../../../utils/rainvm/vm";

const Opcode = AllStandardOps;

describe("FlowERC20 override tests", async function () {
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

  it("should report correct total supply and balances", async () => {
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

    const txFlowMint = await flow.connect(you).flow(mintFlowId, 1234, {
      value: ethers.BigNumber.from(flowTransferMint.native[0].amount),
    });

    const me20Balance1 = await flow.balanceOf(me.address);
    const you20Balance1 = await flow.balanceOf(you.address);
    const totalSupply1 = await flow.totalSupply();

    assert(me20Balance1.isZero());
    assert(
      you20Balance1.eq(mintMint.mul(rebaseRatio).div(ONE)),
      `wrong sender balance minted
      expected  ${mintMint.mul(rebaseRatio).div(ONE)}
      got       ${you20Balance1}`
    );
    assert(totalSupply1.eq(mintMint.mul(rebaseRatio).div(ONE)));

    // -- PERFORM BURN --

    const txFlowBurn = await flow.connect(you).flow(burnFlowId, 1234);

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
});
