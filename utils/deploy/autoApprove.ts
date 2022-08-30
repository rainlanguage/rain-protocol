import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { artifacts, ethers } from "hardhat";
import type { AutoApprove, AutoApproveFactory } from "../../typechain";
import {
  ImplementationEvent as ImplementationEventAutoApproveFactory,
  StateConfigStruct,
} from "../../typechain/contracts/verify/auto/AutoApproveFactory";
import { zeroAddress } from "../constants";
import { getEventArgs } from "../events";

export const autoApproveFactoryDeploy = async () => {
  const integrityFactory = await ethers.getContractFactory(
    "AutoApproveIntegrity"
  );
  const integrity = await integrityFactory.deploy();
  await integrity.deployed();

  const factoryFactory = await ethers.getContractFactory("AutoApproveFactory");
  const autoApproveFactory = (await factoryFactory.deploy(
    integrity.address
  )) as AutoApproveFactory;
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
  config: StateConfigStruct
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

  const tx = await autoApproveFactory
    .connect(deployer)
    .createChildTyped(config);
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
