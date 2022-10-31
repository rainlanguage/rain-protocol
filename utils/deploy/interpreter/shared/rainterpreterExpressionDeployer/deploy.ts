import { ethers } from "hardhat";
import {
  RainterpreterExpressionDeployer,
  Rainterpreter,
} from "../../../../../typechain";

export const rainterpreterExpressionDeployerV1 = async (
  interpreter: Rainterpreter
) => {
  const expressionDeployerFactory = await ethers.getContractFactory(
    "RainterpreterExpressionDeployer"
  );
  const expressionDeployer = (await expressionDeployerFactory.deploy(
    interpreter.address
  )) as RainterpreterExpressionDeployer;

  return expressionDeployer;
};
