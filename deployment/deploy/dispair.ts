import {
  rainterpreterDeploy,
  rainterpreterStoreDeploy,
} from "../../utils/deploy/interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../utils/deploy/interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { registerContract } from "../utils";

export const deployDISpair = async function () {
  // Rainterpreter
  const Rainterpreter = await rainterpreterDeploy();

  // RainterpreterStore
  const RainterpreterStore = await rainterpreterStoreDeploy();

  // ExpressionDeployer
  const ExpressionDeployer = await rainterpreterExpressionDeployerDeploy(
    Rainterpreter,
    RainterpreterStore
  );

  await ExpressionDeployer.deployed();

  const contracts = {
    Rainterpreter,
    RainterpreterStore,
    ExpressionDeployer,
  };

  Object.entries(contracts).forEach((item_) => {
    registerContract(item_[0], item_[1].address);
  });

  return contracts;
};
