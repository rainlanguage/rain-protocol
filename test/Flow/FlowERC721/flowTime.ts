import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import {
  FlowERC721Factory,
  ReserveToken18,
  ReserveTokenERC721,
} from "../../../typechain";
import {
  FlowERC721IOStruct,
  FlowTransferStruct,
  StateConfigStruct,
} from "../../../typechain/contracts/flow/erc721/FlowERC721";
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
import { fillEmptyAddressERC721 } from "../../../utils/flow";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { assertError } from "../../../utils/test/assertError";
import { compareStructs } from "../../../utils/test/compareStructs";

const Opcode = AllStandardOps;

describe("FlowERC721 flowTime tests", async function () {
  let flowERC721Factory: FlowERC721Factory;
  const ME = () => op(Opcode.CALLER);
  const YOU = () => op(Opcode.CONTEXT, 0x0000);

  before(async () => {
    flowERC721Factory = await flowERC721FactoryDeploy();
  });

  it("should not flow more than once for the same id_", async () => {
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

    const flowERC721IO: FlowERC721IOStruct = {
      mints: [],
      burns: [],
      flow: flowTransfer,
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
    const FLOWTRANSFER_YOU_TO_ME_ERC20_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 3));
    const FLOWTRANSFER_YOU_TO_ME_ERC20_AMOUNT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 4));

    const FLOWTRANSFER_ME_TO_YOU_ERC721_TOKEN = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 5));
    const FLOWTRANSFER_ME_TO_YOU_ERC721_ID = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 6));
    
    const CONTEXT_FLOW_TIME = () => op(Opcode.CONTEXT, 0x0002);

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

    const { flow, expressionDeployer } = await flowERC721Deploy(
      deployer,
      flowERC721Factory,
      {
        name: "FlowERC721",
        symbol: "F721",
        stateConfig: stateConfigStruct,
        flows: [
          {
            sources: [sourceFlowIO],
            constants,
          },
        ],
      }
    );

    const flowStates = (await getEvents(
      flow.deployTransaction,
      "DeployExpression",
      expressionDeployer
    )) as DeployExpressionEvent["args"][];

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

    await erc20In
      .connect(you)
      .approve(me.address, flowTransfer.erc20[0].amount);

    const flowStruct = await flow
      .connect(you)
      .callStatic.flow(flowStates[1].expressionAddress, 1234, []);

    compareStructs(
      flowStruct,
      fillEmptyAddressERC721(flowERC721IO, me.address)
    );

    const _txFlow = await flow
      .connect(you)
      .flow(flowStates[1].expressionAddress, 1234, []);
    
    await assertError(
      async () =>
        await flow
          .connect(you)
          .flow(flowStates[1].expressionAddress, 9999, []),
      "Transaction reverted without a reason string",
      "Flow for the same id_ is not restricted"
    );
  });

});
