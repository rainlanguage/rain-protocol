import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { artifacts, ethers } from "hardhat";
import {
  CloneFactory,
  Flow,
  RainterpreterExpressionDeployer,
} from "../../../../typechain";
import {
  EvaluableConfigStruct,
  FlowConfigStruct,
} from "../../../../typechain/contracts/flow/basic/Flow";
import { getEventArgs } from "../../../events";
import { FlowConfig } from "../../../types/flow";
import { strict as assert } from "assert";

import { generateEvaluableConfig } from "../../../interpreter";
import { getTouchDeployer } from "../../interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { getRainMetaDocumentFromContract } from "../../../meta";
import { zeroAddress } from "../../../constants";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../../../typechain/contracts/factory/CloneFactory";

export const flowImplementation = async (): Promise<Flow> => {
  const flowFactory = await ethers.getContractFactory("Flow", {});

  const touchDeployer: RainterpreterExpressionDeployer =
    await getTouchDeployer();
  const deployerDiscoverableMetaConfig: DeployerDiscoverableMetaV1ConstructionConfigStruct =
    {
      meta: getRainMetaDocumentFromContract("flow"),
      deployer: touchDeployer.address,
    };

  const flow = (await flowFactory.deploy(
    deployerDiscoverableMetaConfig
  )) as Flow;

  assert(!(flow.address === zeroAddress), "implementation stake zero address");

  return flow;
};

export const deployFlowClone = async (
  deployer: SignerWithAddress,
  cloneFactory: CloneFactory,
  implementation: Flow,
  flowConfig: FlowConfig
) => {
  const evaluableConfigs: EvaluableConfigStruct[] = [];

  // Building config
  for (let i = 0; i < flowConfig.flows.length; i++) {
    const evaluableConfig = await generateEvaluableConfig(
      flowConfig.flows[i].sources,
      flowConfig.flows[i].constants
    );
    evaluableConfigs.push(evaluableConfig);
  }

  const flowConfigStruct: FlowConfigStruct = {
    dummyConfig: evaluableConfigs[0], // this won't be used anywhere https://github.com/ethereum/solidity/issues/13597
    config: evaluableConfigs,
  };

  const encodedConfig = ethers.utils.defaultAbiCoder.encode(
    [
      "tuple(tuple(address deployer,bytes[] sources,uint256[] constants) dummyConfig , tuple(address deployer,bytes[] sources,uint256[] constants)[] config)",
    ],
    [flowConfigStruct]
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
    (await artifacts.readArtifact("Flow")).abi,
    deployer
  ) as Flow;

  await flow.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  flow.deployTransaction = flowCloneTx;

  return { flow, evaluableConfigs };
};
