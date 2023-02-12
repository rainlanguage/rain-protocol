import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowERC1155Factory, ReserveToken18 } from "../../../typechain";
import { FlowTransferStruct } from "../../../typechain/contracts/flow/erc1155/FlowERC1155";
import { FlowInitializedEvent } from "../../../typechain/contracts/flow/FlowCommon";
import { eighteenZeros } from "../../../utils/constants/bigNumber";
import {
  RAIN_FLOW_ERC1155_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { flowERC1155Deploy } from "../../../utils/deploy/flow/flowERC1155/deploy";
import { flowERC1155FactoryDeploy } from "../../../utils/deploy/flow/flowERC1155/flowERC1155Factory/deploy";
import deploy1820 from "../../../utils/deploy/registry1820/deploy";
import { getEvents } from "../../../utils/events";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { RainterpreterOps } from "../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../utils/test/assertError";
import { FlowERC1155Config } from "../../../utils/types/flow";

const Opcode = RainterpreterOps;

describe("FlowERC1155 flowTime tests", async function () {
  let flowERC1155Factory: FlowERC1155Factory;
  const ME = () => op(Opcode.context, 0x0001); // base context this
  const YOU = () => op(Opcode.context, 0x0000); // base context sender

  before(async () => { 
    // Deploy ERC1820Registry
    const signers = await ethers.getSigners();
    await deploy1820(signers[0]);   

    flowERC1155Factory = await flowERC1155FactoryDeploy();
  });

  it("should support gating flows where a flow time has already been registered for the given id", async () => {
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

    const constants = [
      RAIN_FLOW_SENTINEL,
      1,
      flowTransfer.erc20[0].token,
      flowTransfer.erc20[0].amount,
      flowTransfer.erc20[1].token,
      flowTransfer.erc20[1].amount,
      RAIN_FLOW_ERC1155_SENTINEL,
    ];

    const SENTINEL = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 0));
    const ONE = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 1));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 5));

    const SENTINEL_ERC1155 = () =>
      op(Opcode.readMemory, memoryOperand(MemoryType.Constant, 6));

    const CONTEXT_FLOW_ID = () => op(Opcode.context, 0x0100);

    const FLOW_TIME = () => [
      CONTEXT_FLOW_ID(), // k_
      op(Opcode.get),
    ];

    const sourceFlowIO = concat([
      ...FLOW_TIME(),
      op(Opcode.isZero),
      op(Opcode.ensure, 1),

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

      SENTINEL_ERC1155(), // BURN SKIP
      SENTINEL_ERC1155(), // MINT END

      // Setting Flow Time
      CONTEXT_FLOW_ID(), // k_
      op(Opcode.blockTimestamp), // v__
      op(Opcode.set),
    ]);

    const sources = [ONE()]; // can transfer

    const flowConfigStruct: FlowERC1155Config = {
      expressionConfig: { sources, constants },
      flows: [{ sources: [sourceFlowIO], constants }],
      uri: "FlowERC1155",
    };

    const { flow } = await flowERC1155Deploy(
      deployer,
      flowERC1155Factory,
      flowConfigStruct
    );

    const flowInitialized = (await getEvents(
      flow.deployTransaction,
      "FlowInitialized",
      flow
    )) as FlowInitializedEvent["args"][];

    const me = flow;

    // id 1234 - 1st flow

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    await flow.connect(you).flow(flowInitialized[0].evaluable, [1234], []);

    // id 5678 - 1st flow

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    await flow.connect(you).flow(flowInitialized[0].evaluable, [5678], []);

    // id 1234 - 2nd flow

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    await assertError(
      async () =>
        await flow.connect(you).flow(flowInitialized[0].evaluable, [1234], []),
      "Transaction reverted without a reason string",
      "did not gate flow where flow time already registered for the given flow & id"
    );
  });
});
