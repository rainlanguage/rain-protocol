import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowERC721Factory, ReserveToken18 } from "../../../typechain";
import { FlowTransferStruct } from "../../../typechain/contracts/flow/erc721/FlowERC721";
import { DeployExpressionEvent } from "../../../typechain/contracts/interpreter/shared/RainterpreterExpressionDeployer";
import { eighteenZeros } from "../../../utils/constants/bigNumber";
import {
  RAIN_FLOW_ERC721_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { basicDeploy } from "../../../utils/deploy/basicDeploy";
import { flowERC721Deploy } from "../../../utils/deploy/flow/flowERC721/deploy";
import { flowERC721FactoryDeploy } from "../../../utils/deploy/flow/flowERC721/flowERC721Factory/deploy";
import { getEvents } from "../../../utils/events";
import {
  Debug,
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../utils/test/assertError";
import { FlowERC721Config } from "../../../utils/types/flow";

const Opcode = AllStandardOps;

describe("FlowERC721 flowTime tests", async function () {
  let flowERC721Factory: FlowERC721Factory;
  const ME = () => op(Opcode.CALLER);
  const YOU = () => op(Opcode.CONTEXT, 0x0000);

  before(async () => {
    flowERC721Factory = await flowERC721FactoryDeploy();
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
      RAIN_FLOW_ERC721_SENTINEL,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const ONE = () => op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));
    const FLOWTRANSFER_ME_TO_YOU_ERC20_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));

    const SENTINEL_ERC721 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));

    const CONTEXT_FLOW_TIME = () => op(Opcode.CONTEXT, 0x0002);

    const sourceFlowIO = concat([
      op(Opcode.BLOCK_TIMESTAMP), // on stack for debugging
      CONTEXT_FLOW_TIME(),
      op(Opcode.DEBUG, Debug.StatePacked),

      // CAN FLOW
      CONTEXT_FLOW_TIME(),
      op(Opcode.ISZERO),
      op(Opcode.ENSURE, 1),

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

      SENTINEL_ERC721(), // BURN SKIP
      SENTINEL_ERC721(), // MINT END
    ]);

    const sources = [ONE()]; // can transfer

    const flowConfigStruct: FlowERC721Config = {
      stateConfig: { sources, constants },
      flows: [{ sources: [sourceFlowIO], constants }],
      name: "FlowERC721",
      symbol: "FWIN721",
    };

    const { flow, expressionDeployer } = await flowERC721Deploy(
      deployer,
      flowERC721Factory,
      flowConfigStruct
    );

    const flowExpressions = (await getEvents(
      flow.deployTransaction,
      "DeployExpression",
      expressionDeployer
    )) as DeployExpressionEvent["args"][];

    const me = flow;

    // id 1234 - 1st flow

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    await flow
      .connect(you)
      .flow(flowExpressions[1].expressionAddress, 1234, []);

    // id 5678 - 1st flow

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    await flow
      .connect(you)
      .flow(flowExpressions[1].expressionAddress, 5678, []);

    // id 1234 - 2nd flow

    // Ensure parties hold enough ERC20
    await erc20In.transfer(you.address, flowTransfer.erc20[0].amount);
    await erc20Out.transfer(me.address, flowTransfer.erc20[1].amount);

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    await assertError(
      async () =>
        await flow
          .connect(you)
          .flow(flowExpressions[1].expressionAddress, 1234, []),
      "Transaction reverted without a reason string",
      "did not gate flow where flow time already registered for the given flow & id"
    );
  });
});