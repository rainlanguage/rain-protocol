import { ethers } from "hardhat";
import {
  RainterpreterExpressionDeployer,
  Rainterpreter,
  RainterpreterStore,
} from "../../../../../typechain";
import { RainterpreterExpressionDeployerConstructionConfigStruct } from "../../../../../typechain/contracts/interpreter/shared/RainterpreterExpressionDeployer";
import { getRainDocumentsFromOpmeta } from "../../../../meta";
import {
  rainterpreterDeploy,
  rainterpreterStoreDeploy,
} from "../rainterpreter/deploy";

export const rainterpreterExpressionDeployerDeploy = async (
  interpreter: Rainterpreter,
  store: RainterpreterStore
): Promise<RainterpreterExpressionDeployer> => {
  const bytes_ = getRainDocumentsFromOpmeta();

  const expressionDeployerFactory = await ethers.getContractFactory(
    "RainterpreterExpressionDeployer"
  );

  const deployerConfig: RainterpreterExpressionDeployerConstructionConfigStruct =
    {
      interpreter: interpreter.address,
      store: store.address,
      opMeta: bytes_,
    };

  const expressionDeployer = (await expressionDeployerFactory.deploy(
    deployerConfig
  )) as RainterpreterExpressionDeployer;

  return expressionDeployer;
};

export const getTouchDeployer =
  async (): Promise<RainterpreterExpressionDeployer> => {
    const interpreter: Rainterpreter = await rainterpreterDeploy();
    const store: RainterpreterStore = await rainterpreterStoreDeploy();
    const expressionDeployer: RainterpreterExpressionDeployer =
      await rainterpreterExpressionDeployerDeploy(interpreter, store);

    return expressionDeployer;
  };
