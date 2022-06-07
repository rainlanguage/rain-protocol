import type { Verify, VerifyConfigStruct } from "../../typechain/Verify";
import type {
  ImplementationEvent as ImplementationEventVerifyFactory,
  VerifyFactory,
} from "../../typechain/VerifyFactory";
import { artifacts, ethers } from "hardhat";
import { getEventArgs } from "../events";
import { zeroAddress } from "../constants";
import { Contract } from "ethers";
import { assert } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

export const verifyDeploy = async (
  deployer: SignerWithAddress,
  verifyFactory: VerifyFactory & Contract,
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
  ) as Verify & Contract;
  await verify.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  verify.deployTransaction = tx;
  return verify;
};
