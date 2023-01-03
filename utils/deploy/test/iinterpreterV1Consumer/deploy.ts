import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { rainterpreterDeploy } from "../../interpreter/shared/rainterpreter/deploy";
import { StateConfigStruct } from "../../../../typechain/contracts/orderbook/IOrderBookV1";
import { libEncodedDispatchDeploy } from "../../interpreter/run/libEncodedDispatch/deploy";
import { rainterpreterExpression } from "../../interpreter/shared/rainterpreterExpressionDeployer/deployExpression";

const ENTRYPOINT = 0;

export const iinterpreterV1ConsumerDeploy = async (
  stateConfig: StateConfigStruct,
  maxOutputs: number
) => {
  const interpreter = await rainterpreterDeploy();
  const expressionDeployer = await rainterpreterExpression(
    interpreter,
    stateConfig
  );
  const libEncodedDispatch = await libEncodedDispatchDeploy();

  const dispatch = await libEncodedDispatch.encode(
    expressionDeployer,
    ENTRYPOINT,
    maxOutputs
  );

  const consumerFactory = await ethers.getContractFactory(
    "IInterpreterV1Consumer"
  );
  const consumerLogic =
    (await consumerFactory.deploy()) as IInterpreterV1Consumer;
  await consumerLogic.deployed();

  return {
    consumerLogic,
    interpreter,
    dispatch,
  };
};

export const expressionConsumerDeploy = async (
  stateConfig: StateConfigStruct,
  interpreter: Rainterpreter,
  maxOutputs: number
) => {
  const expressionDeployer = await rainterpreterExpression(
    interpreter,
    stateConfig
  );
  const libEncodedDispatch = await libEncodedDispatchDeploy();

  const dispatch = await libEncodedDispatch.encode(
    expressionDeployer,
    ENTRYPOINT,
    maxOutputs
  );

  return { dispatch, expressionDeployer, libEncodedDispatch };
};
