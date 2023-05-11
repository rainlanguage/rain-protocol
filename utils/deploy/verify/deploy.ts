import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { strict as assert } from "assert";
import { artifacts, ethers } from "hardhat";
import type { CloneFactory, Verify } from "../../../typechain";
import { VerifyConfigStruct } from "../../../typechain/contracts/verify/Verify";

import { zeroAddress } from "../../constants";
import { getEventArgs } from "../../events";

export const verifyImplementation = async (): Promise<Verify> => {
  const verifyFactory = await ethers.getContractFactory("Verify");
  const verifyImplementation = (await verifyFactory.deploy()) as Verify;
  await verifyImplementation.deployed();

  assert(
    !(verifyImplementation.address === zeroAddress),
    "verify implementation zero address"
  );

  return verifyImplementation;
};

export const verifyCloneDeploy = async (
  deployer: SignerWithAddress,
  cloneFactory: CloneFactory,
  implementVerify: Verify,
  admin: string,
  callback: string
): Promise<Verify> => {
  const verifyConfig: VerifyConfigStruct = {
    admin: admin,
    callback: callback,
  };

  const encodedConfig = ethers.utils.defaultAbiCoder.encode(
    ["tuple(address admin , address callback )"],
    [verifyConfig]
  );

  const verifyCloneTx = await cloneFactory.clone(
    implementVerify.address,
    encodedConfig
  );

  const verify = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(verifyCloneTx, "NewClone", cloneFactory)).clone
      ),
      20
    ),
    (await artifacts.readArtifact("Verify")).abi,
    deployer
  ) as Verify;
  await verify.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  verify.deployTransaction = verifyCloneTx;

  return verify;
};
