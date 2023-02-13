import { BigNumberish, BytesLike } from "ethers";
import { Rainterpreter } from "../../../../../typechain";
import { PromiseOrValue } from "../../../../../typechain/common";
import { ExpressionAddressEvent } from "../../../../../typechain/contracts/interpreter/shared/RainterpreterExpressionDeployer";

import { getEvents } from "../../../../events";
import { rainterpreterStoreDeploy } from "../rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "./deploy";

export const rainterpreterExpression = async (
  interpreter: Rainterpreter,
  sources_: PromiseOrValue<BytesLike>[],
  constants_: PromiseOrValue<BigNumberish>[]
) => {
  const store = await rainterpreterStoreDeploy();
  const expression = await rainterpreterExpressionDeployerDeploy(
    interpreter,
    store
  );

  const expressionTx = await expression.deployExpression(sources_, constants_, [
    0,
  ]);

  const eventData = (await getEvents(
    expressionTx,
    "ExpressionAddress",
    expression
  )) as ExpressionAddressEvent["args"][];

  return eventData[0].expression;
};
