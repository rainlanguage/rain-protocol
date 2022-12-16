import { ethers } from "hardhat";
import {
  RainterpreterExpressionDeployer,
  Rainterpreter,
} from "../../../../../typechain";
import { DeployExpressionEvent } from "../../../../../typechain/contracts/interpreter/shared/RainterpreterExpressionDeployer";
import { StateConfigStruct } from "../../../../../typechain/contracts/orderbook/IOrderBookV1";
import { getEvents } from "../../../../events";

export const rainterpreterExpression = async (
  interpreter: Rainterpreter,
  stateConfig: StateConfigStruct
) => {
  const expressionDeployerFactory = await ethers.getContractFactory(
    "RainterpreterExpressionDeployer"
  );
  const expressionDeployer = (await expressionDeployerFactory.deploy(
    interpreter.address
  )) as RainterpreterExpressionDeployer;

  const expressionTx  = await expressionDeployer.deployExpression(
    stateConfig,
    [0]
  );

  const [eventData] = (await getEvents(
    expressionTx,
    "DeployExpression",
    expressionDeployer
  )) as DeployExpressionEvent["args"][];

  return eventData.expressionAddress;
};
