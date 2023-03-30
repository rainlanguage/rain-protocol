import { ethers } from "hardhat";
import { IInterpreterV1Consumer, Rainterpreter } from "../../../../typechain";
import { rainterpreterDeploy } from "../../interpreter/shared/rainterpreter/deploy";

import { rainterpreterExpression } from "../../interpreter/shared/rainterpreterExpressionDeployer/deployExpression";
import { PromiseOrValue } from "../../../../typechain/common";
import { BigNumberish, BytesLike } from "ethers";

const ENTRYPOINT = 0;

const encodeDispatch = async (
  expressionDeployer: BigNumberish,
  entrypoint: BigNumberish,
  maxOutputs: BigNumberish
) => {
  return ethers.BigNumber.from(expressionDeployer)
    .shl(32)
    .or(ethers.BigNumber.from(entrypoint).shl(16))
    .or(maxOutputs);
};

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

  const dispatch = encodeDispatch(expressionDeployer, ENTRYPOINT, maxOutputs);

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

  const dispatch = await encodeDispatch(
    expressionDeployer,
    ENTRYPOINT,
    maxOutputs
  );

  return { dispatch, expressionDeployer };
};
