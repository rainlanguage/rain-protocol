import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { artifacts, ethers } from "hardhat";
import { FlowERC721Factory } from "../../../../typechain";
import {
  EvaluableConfigStruct,
  FlowERC721,
  FlowERC721ConfigStruct,
} from "../../../../typechain/contracts/flow/erc721/FlowERC721";
import { getEventArgs } from "../../../events";
import { FlowERC721Config } from "../../../types/flow";

import { generateEvaluableConfig } from "../../../interpreter";

export const flowERC721Deploy = async (
  deployer: SignerWithAddress,
  flowERC721Factory: FlowERC721Factory,
  flowERC721Config: FlowERC721Config,
  ...args: Overrides[]
) => {
  // Building evaluableConfig
  const evaluableConfig: EvaluableConfigStruct = await generateEvaluableConfig(
    flowERC721Config.expressionConfig.sources,
    flowERC721Config.expressionConfig.constants
  );

  // Building flowConfig
  const flowConfig: EvaluableConfigStruct[] = [];
  for (let i = 0; i < flowERC721Config.flows.length; i++) {
    const evaluableConfig = await generateEvaluableConfig(
      flowERC721Config.flows[i].sources,
      flowERC721Config.flows[i].constants

    );
    flowConfig.push(evaluableConfig);
  }

  const flowERC721ConfigStruct: FlowERC721ConfigStruct = {
    evaluableConfig: evaluableConfig,
    flowConfig: flowConfig,
    name: flowERC721Config.name,
    symbol: flowERC721Config.symbol,
  };

  const txDeploy = await flowERC721Factory.createChildTyped(
    flowERC721ConfigStruct,
    ...args
  );

  const flow = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", flowERC721Factory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("FlowERC721")).abi,
    deployer
  ) as FlowERC721;

  await flow.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  flow.deployTransaction = txDeploy;

  return { flow };
};
