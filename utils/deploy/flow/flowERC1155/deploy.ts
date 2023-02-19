import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { artifacts, ethers } from "hardhat";
import { FlowERC1155Factory } from "../../../../typechain";
import {
  EvaluableConfigStruct,
  FlowERC1155,
  FlowERC1155ConfigStruct,
} from "../../../../typechain/contracts/flow/erc1155/FlowERC1155";
import { getEventArgs } from "../../../events";
import { FlowERC1155Config } from "../../../types/flow";
import { generateEvaluableConfig } from "../../../interpreter";

export const flowERC1155Deploy = async (
  deployer: SignerWithAddress,
  flowERC1155Factory: FlowERC1155Factory,
  flowERC1155Config: FlowERC1155Config,
  ...args: Overrides[]
) => {
  // Building evaluableConfig
  const evaluableConfig: EvaluableConfigStruct = await generateEvaluableConfig(
    flowERC1155Config.expressionConfig.sources,
    flowERC1155Config.expressionConfig.constants
  );

  // Building flowConfig
  const flowConfig: EvaluableConfigStruct[] = [];
  for (let i = 0; i < flowERC1155Config.flows.length; i++) {
    const evaluableConfig = await generateEvaluableConfig(
      flowERC1155Config.flows[i].sources,
      flowERC1155Config.flows[i].constants
    );
    flowConfig.push(evaluableConfig);
  }

  const flowERC1155ConfigStruct: FlowERC1155ConfigStruct = {
    evaluableConfig: evaluableConfig,
    flowConfig: flowConfig,
    uri: flowERC1155Config.uri,
  };

  const txDeploy = await flowERC1155Factory.createChildTyped(
    flowERC1155ConfigStruct,
    ...args
  );

  const flow = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", flowERC1155Factory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("FlowERC1155")).abi,
    deployer
  ) as FlowERC1155;

  await flow.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  flow.deployTransaction = txDeploy;

  return { flow };
};
