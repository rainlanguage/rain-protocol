import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { FlowFactory } from "../../../typechain";
import { RAIN_FLOW_SENTINEL } from "../../../utils/constants/sentinel";
import { flowDeploy } from "../../../utils/deploy/flow/basic/deploy";
import { flowFactoryDeploy } from "../../../utils/deploy/flow/basic/flowFactory/deploy";
import {
  memoryOperand,
  MemoryType,
  op,
} from "../../../utils/interpreter/interpreter";
import { AllStandardOps } from "../../../utils/interpreter/ops/allStandardOps";
import { FlowConfig } from "../../../utils/types/flow";

const Opcode = AllStandardOps;

describe("Flow deployExpression tests", async function () {
  let flowFactory: FlowFactory;

  before(async () => {
    flowFactory = await flowFactoryDeploy();
  });

  it.only("should deploy expression", async function () {
    const signers = await ethers.getSigners();
    const deployer = signers[0];

    const constants = [RAIN_FLOW_SENTINEL, 1];

    const SENTINEL = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 0));
    const CAN_SIGN_CONTEXT = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));
    const CAN_FLOW = () =>
      op(Opcode.STATE, memoryOperand(MemoryType.Constant, 1));

    const sourceFlowIO = concat([
      SENTINEL(), // ERC1155 SKIP
      SENTINEL(), // ERC721 SKIP
      SENTINEL(), // ERC20 SKIP
      SENTINEL(), // NATIVE END
    ]);

    const sources = [];

    const flowConfigStruct: FlowConfig = {
      stateConfig: { sources, constants },
      flows: [
        { sources: [CAN_SIGN_CONTEXT(), CAN_FLOW(), sourceFlowIO], constants },
      ],
    };

    const _flow = await flowDeploy(deployer, flowFactory, flowConfigStruct);
  });
});
