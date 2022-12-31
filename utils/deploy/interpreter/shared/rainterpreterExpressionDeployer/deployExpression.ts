import { Rainterpreter } from "../../../../../typechain";
import { ExpressionDeployedEvent } from "../../../../../typechain/contracts/interpreter/shared/RainterpreterExpressionDeployer";
import { StateConfigStruct } from "../../../../../typechain/contracts/orderbook/IOrderBookV1";
import { getEvents } from "../../../../events";
import { rainterpreterExpressionDeployerDeploy } from "./deploy";

export const rainterpreterExpression = async (
  interpreter: Rainterpreter,
  stateConfig: StateConfigStruct
) => {
  const expression = await rainterpreterExpressionDeployerDeploy(interpreter);

  const expressionTx = await expression.deployExpression(stateConfig, [0]);

  const eventData = (await getEvents(
    expressionTx,
    "ExpressionDeployed",
    expression
  )) as ExpressionDeployedEvent["args"][];

  return eventData[0].expression;
};
