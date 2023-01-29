import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { artifacts, ethers } from "hardhat";
import { FlowERC20Factory } from "../../../../typechain";
import {
  EvaluableConfigStruct,
  FlowERC20,
  FlowERC20ConfigStruct,
} from "../../../../typechain/contracts/flow/erc20/FlowERC20";
import { getEventArgs } from "../../../events";
import { FlowERC20Config } from "../../../types/flow";
import { generateEvaluableConfig } from "../../../interpreter";

export const flowERC20Deploy = async (
  deployer: SignerWithAddress,
  flowERC20Factory: FlowERC20Factory,
  flowERC20Config: FlowERC20Config,
  ...args: Overrides[]
) => {
  // Building evaluableConfig
  const evaluableConfig: EvaluableConfigStruct = await generateEvaluableConfig(
    flowERC20Config.expressionConfig
  );

  // Building flowConfig
  const flowConfig: EvaluableConfigStruct[] = [];
  for (let i = 0; i < flowERC20Config.flows.length; i++) {
    const evaluableConfig = await generateEvaluableConfig(
      flowERC20Config.flows[i]
    );
    flowConfig.push(evaluableConfig);
  }

  const flowERC20ConfigStruct: FlowERC20ConfigStruct = {
    evaluableConfig: evaluableConfig,
    flowConfig: flowConfig,
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

  return { flow };
};
