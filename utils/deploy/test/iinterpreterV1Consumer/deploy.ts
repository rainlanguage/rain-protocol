import { ethers } from "hardhat";
import { IInterpreterV1Consumer } from "../../../../typechain";
import {} from "../../interpreter/integrity/standardIntegrity/deploy";
import { rainterpreterExpressionDeployer } from "../../interpreter/shared/rainterpreterExpressionDeployer/deploy";
import { rainterpreterDeploy } from "../../interpreter/shared/rainterpreter/deploy";
import { StateConfigStruct } from "../../../../typechain/contracts/orderbook/IOrderBookV1";
import { libEncodedDispatchDeploy } from "../../interpreter/run/libEncodedDispatch/deploy";
import { rainterpreterExpression } from "../../interpreter/shared/rainterpreterExpressionDeployer/deployExpression";

const ENTRYPOINT = 0;
const MIN_OUTPUTS = 0;
const MAX_OUTPUTS = 65535;

export const iinterpreterV1ConsumerDeploy = async (
  stateConfig: StateConfigStruct
) => {
  const interpreter = await rainterpreterDeploy();
  const expressionDeployer = await rainterpreterExpression(
    interpreter,
    stateConfig
  );
  const libEncodedDispatch = await libEncodedDispatchDeploy();

  let dispatch = await libEncodedDispatch.encode(
    expressionDeployer,
    ENTRYPOINT,
    MAX_OUTPUTS
  );

  const consumerFactory = await ethers.getContractFactory(
    "IInterpreterV1Consumer"
  );
  const consumerLogic = (await consumerFactory.deploy()) as IInterpreterV1Consumer;
  await consumerLogic.deployed();

  return { consumerLogic: consumerLogic, interpreter: interpreter, dispatch: dispatch };
};
