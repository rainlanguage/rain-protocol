import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { artifacts, ethers } from "hardhat";
import {
  CloneFactory,
  RainterpreterExpressionDeployer,
} from "../../../../typechain";
import {
  EvaluableConfigStruct,
  FlowERC721,
  FlowERC721ConfigStruct,
} from "../../../../typechain/contracts/flow/erc721/FlowERC721";
import { getEventArgs } from "../../../events";
import { FlowERC721Config } from "../../../types/flow";

import { generateEvaluableConfig } from "../../../interpreter";
import { getTouchDeployer } from "../../interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { getRainMetaDocumentFromContract } from "../../../meta";
import { zeroAddress } from "../../../constants";
import { strict as assert } from "assert";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../../../typechain/contracts/factory/CloneFactory";

export const flowERC721Implementation = async (): Promise<FlowERC721> => {
  const flowFactory = await ethers.getContractFactory("FlowERC721", {});

  const touchDeployer: RainterpreterExpressionDeployer =
    await getTouchDeployer();
  const deployerDiscoverableMetaConfig: DeployerDiscoverableMetaV1ConstructionConfigStruct =
    {
      meta: getRainMetaDocumentFromContract("flow721"),
      deployer: touchDeployer.address,
    };

  const flow = (await flowFactory.deploy(
    deployerDiscoverableMetaConfig
  )) as FlowERC721;

  assert(!(flow.address === zeroAddress), "implementation stake zero address");

  return flow;
};

export const flowERC721Clone = async (
  deployer: SignerWithAddress,
  cloneFactory: CloneFactory,
  implementation: FlowERC721,
  flowERC721Config: FlowERC721Config
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
    baseURI: flowERC721Config.baseURI,
  };

  const encodedConfig = ethers.utils.defaultAbiCoder.encode(
    [
      "tuple(string name, string symbol, string baseURI, tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig , tuple(address deployer,bytes[] sources,uint256[] constants)[] flowConfig)",
    ],
    [flowERC721ConfigStruct]
  );

  const flowCloneTx = await cloneFactory.clone(
    implementation.address,
    encodedConfig
  );

  const flow = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(flowCloneTx, "NewClone", cloneFactory)).clone
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("FlowERC721")).abi,
    deployer
  ) as FlowERC721;

  await flow.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  flow.deployTransaction = flowCloneTx;

  return { flow };
};
