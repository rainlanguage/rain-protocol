import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { artifacts, ethers } from "hardhat";
import type { AutoApprove, AutoApproveFactory } from "../../../../../typechain";
import { EvaluableConfigStruct } from "../../../../../typechain/contracts/verify/auto/AutoApprove";
import {
  ImplementationEvent as ImplementationEventAutoApproveFactory,
  ExpressionConfigStruct,
} from "../../../../../typechain/contracts/verify/auto/AutoApproveFactory";
import { zeroAddress } from "../../../../constants";
import { getEventArgs } from "../../../../events";
import { generateEvaluableConfig } from "../../../../interpreter";

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
  expressionConfig: ExpressionConfigStruct
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

  const evaluableConfig: EvaluableConfigStruct = await generateEvaluableConfig(
    expressionConfig
  );

  const tx = await autoApproveFactory
    .connect(deployer)
    .createChildTyped(evaluableConfig);
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
