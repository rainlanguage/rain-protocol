import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { artifacts, ethers } from "hardhat";
import type { AutoApprove, AutoApproveFactory } from "../../../../../typechain";
import {
  AutoApproveConfigStruct,
  ImplementationEvent as ImplementationEventAutoApproveFactory,
  StateConfigStruct,
} from "../../../../../typechain/contracts/verify/auto/AutoApproveFactory";
import { zeroAddress } from "../../../../constants";
import { getEventArgs } from "../../../../events";
import { rainterpreterDeploy } from "../../../interpreter/shared/rainterpreter/deploy";
import { rainterpreterExpressionDeployerDeploy } from "../../../interpreter/shared/rainterpreterExpressionDeployer/deploy";

export const autoApproveFactoryDeploy = async () => {
  const factoryFactory = await ethers.getContractFactory("AutoApproveFactory");
  const autoApproveFactory =
    (await factoryFactory.deploy()) as AutoApproveFactory;
  await autoApproveFactory.deployed();

  const { implementation } = (await getEventArgs(
    autoApproveFactory.deployTransaction,
    "Implementation",
    autoApproveFactory
  )) as ImplementationEventAutoApproveFactory["args"];
  assert(
    !(implementation === zeroAddress),
    "implementation autoApprove factory zero address"
  );

  return autoApproveFactory;
};

export const autoApproveDeploy = async (
  deployer: SignerWithAddress,
  autoApproveFactory: AutoApproveFactory,
  stateConfig: StateConfigStruct
) => {
  const { implementation } = (await getEventArgs(
    autoApproveFactory.deployTransaction,
    "Implementation",
    autoApproveFactory
  )) as ImplementationEventAutoApproveFactory["args"];
  assert(
    !(implementation === zeroAddress),
    "implementation autoApprove factory zero address"
  );

  const interpreter = await rainterpreterDeploy();
  const expressionDeployer = await rainterpreterExpressionDeployerDeploy(
    interpreter
  );

  const autoApproveConfig: AutoApproveConfigStruct = {
    expressionDeployer: expressionDeployer.address,
    interpreter: interpreter.address,
    stateConfig,
  };

  const tx = await autoApproveFactory
    .connect(deployer)
    .createChildTyped(autoApproveConfig);
  const autoApprove = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(tx, "NewChild", autoApproveFactory)).child
      ),
      20
    ),
    (await artifacts.readArtifact("AutoApprove")).abi,
    deployer
  ) as AutoApprove;
  await autoApprove.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  autoApprove.deployTransaction = tx;

  return autoApprove;
};
