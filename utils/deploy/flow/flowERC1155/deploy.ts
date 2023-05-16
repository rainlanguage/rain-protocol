import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { artifacts, ethers } from "hardhat";
import {
  CloneFactory,
  RainterpreterExpressionDeployer,
} from "../../../../typechain";
import {
  EvaluableConfigStruct,
  FlowERC1155,
  FlowERC1155ConfigStruct,
} from "../../../../typechain/contracts/flow/erc1155/FlowERC1155";
import { getEventArgs } from "../../../events";
import { FlowERC1155Config } from "../../../types/flow";
import { generateEvaluableConfig } from "../../../interpreter";
import { getTouchDeployer } from "../../interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { getRainMetaDocumentFromContract } from "../../../meta";
import { zeroAddress } from "../../../constants";
import { strict as assert } from "assert";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../../../typechain/contracts/factory/CloneFactory";

export const flowERC1155Implementation = async (): Promise<FlowERC1155> => {
  const flowFactory = await ethers.getContractFactory("FlowERC1155", {});

  const touchDeployer: RainterpreterExpressionDeployer =
    await getTouchDeployer();
  const deployerDiscoverableMetaConfig: DeployerDiscoverableMetaV1ConstructionConfigStruct =
    {
      meta: getRainMetaDocumentFromContract("flow1155"),
      deployer: touchDeployer.address,
    };

  const flow = (await flowFactory.deploy(
    deployerDiscoverableMetaConfig
  )) as FlowERC1155;

  assert(!(flow.address === zeroAddress), "implementation stake zero address");

  return flow;
};

export const flowERC1155Clone = async (
  deployer: SignerWithAddress,
  cloneFactory: CloneFactory,
  implementation: FlowERC1155,
  flowERC1155Config: FlowERC1155Config
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

  const encodedConfig = ethers.utils.defaultAbiCoder.encode(
    [
      "tuple(string uri, tuple(address deployer,bytes[] sources,uint256[] constants) evaluableConfig , tuple(address deployer,bytes[] sources,uint256[] constants)[] flowConfig)",
    ],
    [flowERC1155ConfigStruct]
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
    (await artifacts.readArtifact("FlowERC1155")).abi,
    deployer
  ) as FlowERC1155;

  await flow.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  flow.deployTransaction = flowCloneTx;

  return { flow };
};
