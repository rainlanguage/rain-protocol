import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { artifacts, ethers } from "hardhat";
import type { Verify, VerifyFactory } from "../../../typechain";
import { VerifyConfigStruct } from "../../../typechain/contracts/verify/Verify";
import { ImplementationEvent as ImplementationEventVerifyFactory } from "../../../typechain/contracts/verify/VerifyFactory";
import { zeroAddress } from "../../constants";
import { getEventArgs } from "../../events";

export const verifyFactoryDeploy = async () => {
  const verifyFactoryFactory = await ethers.getContractFactory("VerifyFactory");
  const verifyFactory = (await verifyFactoryFactory.deploy()) as VerifyFactory;
  await verifyFactory.deployed();

  const { implementation } = (await getEventArgs(
    verifyFactory.deployTransaction,
    "Implementation",
    verifyFactory
  )) as ImplementationEventVerifyFactory["args"];
  assert(
    !(implementation === zeroAddress),
    "implementation verify factory zero address"
  );

  return verifyFactory;
};

export const verifyDeploy = async (
  deployer: SignerWithAddress,
  verifyFactory: VerifyFactory,
  config: VerifyConfigStruct
) => {
  const { implementation } = (await getEventArgs(
    verifyFactory.deployTransaction,
    "Implementation",
    verifyFactory
  )) as ImplementationEventVerifyFactory["args"];
  assert(
    !(implementation === zeroAddress),
    "implementation verify factory zero address"
  );

  const tx = await verifyFactory.createChildTyped(config);
  const verify = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(tx, "NewChild", verifyFactory)).child
      ),
      20
    ),
    (await artifacts.readArtifact("Verify")).abi,
    deployer
  ) as Verify;
  await verify.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  verify.deployTransaction = tx;
  return verify;
};
