import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowERC20Factory } from "../../../typechain/contracts/flow/erc20";
import {
  RAIN_FLOW_ERC20_SENTINEL,
  RAIN_FLOW_SENTINEL,
} from "../../../utils/constants/sentinel";
import { flowERC20Deploy } from "../../../utils/deploy/flow/flowERC20/deploy";
import { getEvents } from "../../../utils/events";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";

import { DeployExpressionEvent } from "../../../typechain/contracts/interpreter/shared/RainterpreterExpressionDeployer";
import { assertError } from "../../../utils";
import { flowERC20FactoryDeploy } from "../../../utils/deploy/flow/flowERC20/flowERC20Factory/deploy";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { FlowERC20Config } from "../../../utils/types/flow";

const Opcode = AllStandardOps;
const YOU = () => op(Opcode.CONTEXT, 0x0000);
describe("FlowERC20 flowTime tests", async function () {
  let flowERC20Factory: FlowERC20Factory;

  before(async () => {
    flowERC20Factory = await flowERC20FactoryDeploy();
  });

  it("should not flow more than once for the same id_", async () => {
    const signers = await ethers.getSigners();
    const deployer = signers[0];
    const you = signers[1];

    const constants = [
      RAIN_FLOW_SENTINEL,
      RAIN_FLOW_ERC20_SENTINEL,
      (10 ** 18).toString(),
      0,
      1,
    ];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const SENTINEL_ERC20 = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    const ONE = () => op(Opcode.STATE, memoryOperand(MemoryType.Constant, 2));

    const CANNOT_TRANSFER = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));

    const CONTEXT_FLOW_TIME = () => op(Opcode.CONTEXT, 0x0002);

    // prettier-ignore
    const sourceFlow = concat([
          // CAN FLOW
          CONTEXT_FLOW_TIME(),
        op(Opcode.ISZERO),
      op(Opcode.ENSURE, 1),
      // FLOW
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE SKIP
      SENTINEL_ERC20(), // BURN SKIP
      SENTINEL_ERC20(), // MINT END
      YOU(), // ADDRESS
      ONE(), // MINT AMOUNT
    ]);

    // WIN FLOW
    const flow_ConfigStruct: FlowERC20Config = {
      name: "FlowERC20",
      symbol: "FWIN20",
      stateConfig: {
        sources: [CANNOT_TRANSFER()],
        constants,
      },
      flows: [{ sources: [sourceFlow], constants }],
    };

    const { flow: flow, expressionDeployer: expressionDeployer } =
      await flowERC20Deploy(deployer, flowERC20Factory, flow_ConfigStruct);

    const flowExpressions = (await getEvents(
      flow.deployTransaction,
      "DeployExpression",
      expressionDeployer
    )) as DeployExpressionEvent["args"][];

    // Flowing once
    await flow
      .connect(you)
      .flow(flowExpressions[1].expressionAddress, 9999, []);

    // Flowing again with the same ID

    await assertError(
      async () =>
        await flow
          .connect(you)
          .flow(flowExpressions[1].expressionAddress, 9999, []),
      "Transaction reverted without a reason string",
      "Flow for the same id_ is not restricted"
    );
  });
});
