import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { artifacts, ethers } from "hardhat";
import { FlowERC20Factory, RainterpreterV1 } from "../../../../typechain";
import {
  FlowERC20,
  FlowERC20ConfigStruct,
} from "../../../../typechain/contracts/flow/erc20/FlowERC20";
import { getEventArgs } from "../../../events";
import { FlowERC20Config } from "../../../types/flow";
import { basicDeploy } from "../../basicDeploy";

export const flowERC20Deploy = async (
  deployer: SignerWithAddress,
  flowERC20Factory: FlowERC20Factory,
  flowERC20Config: FlowERC20Config,
  ...args: Overrides[]
): Promise<FlowERC20> => {
  // TODO: Deploy contract which implements `IExpressionDeployer`
  const expressionDeployer = { address: "" };

  const interpreter = (await basicDeploy(
    "RainterpreterV1",
    {}
  )) as RainterpreterV1;

  const flowERC20ConfigStruct: FlowERC20ConfigStruct = {
    stateConfig: flowERC20Config.stateConfig,
    flowConfig: {
      expressionDeployer: expressionDeployer.address,
      interpreter: interpreter.address,
      flows: flowERC20Config.flows,
      flowFinalMinStack: 4,
    },
    name: flowERC20Config.name,
    symbol: flowERC20Config.symbol,
  };

  const txDeploy = await flowERC20Factory.createChildTyped(
    flowERC20ConfigStruct,
    ...args
  );

  const flow = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", flowERC20Factory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("FlowERC20")).abi,
    deployer
  ) as FlowERC20;

  await flow.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  flow.deployTransaction = txDeploy;

  return flow;
};
