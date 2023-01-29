import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { artifacts, ethers } from "hardhat";
import { Flow, FlowFactory, RainterpreterStore } from "../../../../typechain";
import {
  EvaluableConfigStruct,
  FlowConfigStruct,
} from "../../../../typechain/contracts/flow/basic/Flow";
import { getEventArgs } from "../../../events";
import { FlowConfig } from "../../../types/flow";
import { rainterpreterExpressionDeployerDeploy } from "../../interpreter/shared/rainterpreterExpressionDeployer/deploy";
import {
  rainterpreterDeploy,
  rainterpreterStoreDeploy,
} from "../../interpreter/shared/rainterpreter/deploy";

export const flowDeploy = async (
  deployer: SignerWithAddress,
  flowFactory: FlowFactory,
  flowConfig: FlowConfig,
  ...args: Overrides[]
) => {
  const evaluableConfigs: EvaluableConfigStruct[] = [];

  // Building config
  for (let i = 0; i < flowConfig.flows.length; i++) {
    const interpreter = await rainterpreterDeploy();
    const expressionDeployer = await rainterpreterExpressionDeployerDeploy(
      interpreter
    );
    const interpreterStore: RainterpreterStore =
      await rainterpreterStoreDeploy();

    evaluableConfigs.push({
      deployer: expressionDeployer.address,
      interpreter: interpreter.address,
      store: interpreterStore.address,
      expressionConfig: flowConfig.flows[i],
    });
  }

  const flowConfigStruct: FlowConfigStruct = {
    dummyConfig: evaluableConfigs[0], // this won't be used anywhere https://github.com/ethereum/solidity/issues/13597
    config: evaluableConfigs,
  };

  const txDeploy = await flowFactory.createChildTyped(
    flowConfigStruct,
    ...args
  );

  const flow = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", flowFactory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("Flow")).abi,
    deployer
  ) as Flow;

  await flow.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  flow.deployTransaction = txDeploy;

  return { flow, evaluableConfigs };
};
