import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { rainterpreterDeploy } from "../../interpreter/shared/rainterpreter/deploy";

import { libEncodedDispatchDeploy } from "../../interpreter/run/libEncodedDispatch/deploy";
import { rainterpreterExpression } from "../../interpreter/shared/rainterpreterExpressionDeployer/deployExpression";
import { PromiseOrValue } from "../../../../typechain/common";
import { BigNumberish, BytesLike } from "ethers";

const ENTRYPOINT = 0;

export const iinterpreterV1ConsumerDeploy = async (
  sources: PromiseOrValue<BytesLike>[],
  constants: PromiseOrValue<BigNumberish>[],
  maxOutputs: number
) => {
  const interpreter = await rainterpreterDeploy();
  const expressionDeployer = await rainterpreterExpression(
    interpreter,
    sources,
    constants
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
  sources: PromiseOrValue<BytesLike>[],
  constants: PromiseOrValue<BigNumberish>[],
  interpreter: Rainterpreter,
  maxOutputs: number
) => {
  const expressionDeployer = await rainterpreterExpression(
    interpreter,
    sources,
    constants
  );
  const libEncodedDispatch = await libEncodedDispatchDeploy();

  const dispatch = await libEncodedDispatch.encode(
    expressionDeployer,
    ENTRYPOINT,
    maxOutputs
  );

  return { dispatch, expressionDeployer, libEncodedDispatch };
};
