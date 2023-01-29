import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { artifacts, ethers } from "hardhat";
import { FlowERC1155Factory, RainterpreterStore } from "../../../../typechain";
import {
  EvaluableConfigStruct,
  FlowERC1155,
  FlowERC1155ConfigStruct,
} from "../../../../typechain/contracts/flow/erc1155/FlowERC1155";
import { getEventArgs } from "../../../events";
import { FlowERC1155Config } from "../../../types/flow";
import { rainterpreterExpressionDeployerDeploy } from "../../interpreter/shared/rainterpreterExpressionDeployer/deploy";
import {
  rainterpreterDeploy,
  rainterpreterStoreDeploy,
} from "../../interpreter/shared/rainterpreter/deploy";

export const flowERC1155Deploy = async (
  deployer: SignerWithAddress,
  flowERC1155Factory: FlowERC1155Factory,
  flowERC1155Config: FlowERC1155Config,
  ...args: Overrides[]
) => {
  const interpreter = await rainterpreterDeploy();
  const expressionDeployer = await rainterpreterExpressionDeployerDeploy(
    interpreter
  );
  const interpreterStore: RainterpreterStore = await rainterpreterStoreDeploy();

  // Building evaluableConfig
  const evaluableConfig: EvaluableConfigStruct = {
    deployer: expressionDeployer.address,
    interpreter: interpreter.address,
    store: interpreterStore.address,
    expressionConfig: flowERC1155Config.expressionConfig,
  };

  // Building flowConfig
  const flowConfig: EvaluableConfigStruct[] = [];
  for (let i = 0; i < flowERC1155Config.flows.length; i++) {
    const interpreter_ = await rainterpreterDeploy();
    const expressionDeployer_ = await rainterpreterExpressionDeployerDeploy(
      interpreter_
    );
    const interpreterStore_: RainterpreterStore =
      await rainterpreterStoreDeploy();

    flowConfig.push({
      deployer: expressionDeployer_.address,
      interpreter: interpreter_.address,
      store: interpreterStore_.address,
      expressionConfig: flowERC1155Config.flows[i],
    });
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

  return { flow, interpreter, expressionDeployer };
};
