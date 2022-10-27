import { ethers } from "hardhat";
import {
  RainterpreterExpressionDeployerV1,
  RainterpreterV1,
} from "../../../../../typechain";

export const rainterpreterExpressionDeployerV1 = async (
  interpreter: RainterpreterV1
) => {
  const expressionDeployerFactory = await ethers.getContractFactory(
    "RainterpreterExpressionDeployerV1"
  );
  const expressionDeployer = (await expressionDeployerFactory.deploy(
    interpreter.address
  )) as RainterpreterExpressionDeployerV1;

  return expressionDeployer;
};
