import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { artifacts, ethers } from "hardhat";
import { FlowERC20Factory, RainterpreterStore } from "../../../../typechain";
import {
  EvaluableConfigStruct,
  FlowERC20,
  FlowERC20ConfigStruct,
} from "../../../../typechain/contracts/flow/erc20/FlowERC20";
import { getEventArgs } from "../../../events";
import { FlowERC20Config } from "../../../types/flow";
import { rainterpreterExpressionDeployerDeploy } from "../../interpreter/shared/rainterpreterExpressionDeployer/deploy";
import {
  rainterpreterDeploy,
  rainterpreterStoreDeploy,
} from "../../interpreter/shared/rainterpreter/deploy";

export const flowERC20Deploy = async (
  deployer: SignerWithAddress,
  flowERC20Factory: FlowERC20Factory,
  flowERC20Config: FlowERC20Config,
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
    expressionConfig: flowERC20Config.expressionConfig,
  };

  // Building flowConfig
  const flowConfig: EvaluableConfigStruct[] = [];
  for (let i = 0; i < flowERC20Config.flows.length; i++) {
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
      expressionConfig: flowERC20Config.flows[i],
    });
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

  return { flow, interpreter, expressionDeployer };
};
