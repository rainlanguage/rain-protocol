import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Overrides } from "ethers";
import { artifacts, ethers } from "hardhat";
import { FlowERC721Factory, RainterpreterStore } from "../../../../typechain";
import {
  EvaluableConfigStruct,
  FlowERC721,
  FlowERC721ConfigStruct,
} from "../../../../typechain/contracts/flow/erc721/FlowERC721";
import { getEventArgs } from "../../../events";
import { FlowERC721Config } from "../../../types/flow";
import { rainterpreterExpressionDeployerDeploy } from "../../interpreter/shared/rainterpreterExpressionDeployer/deploy";
import {
  rainterpreterDeploy,
  rainterpreterStoreDeploy,
} from "../../interpreter/shared/rainterpreter/deploy";

export const flowERC721Deploy = async (
  deployer: SignerWithAddress,
  flowERC721Factory: FlowERC721Factory,
  flowERC721Config: FlowERC721Config,
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
    expressionConfig: flowERC721Config.expressionConfig,
  };

  // Building flowConfig
  const flowConfig: EvaluableConfigStruct[] = [];
  for (let i = 0; i < flowERC721Config.flows.length; i++) {
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
      expressionConfig: flowERC721Config.flows[i],
    });
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

  return { flow, interpreter, expressionDeployer };
};
