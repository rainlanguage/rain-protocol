import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { artifacts, ethers } from "hardhat";
import type { CombineTier, CombineTierFactory } from "../../../../typechain";
import { CombineTierConfigStruct } from "../../../../typechain/contracts/tier/CombineTier";
import { ImplementationEvent as ImplementationEventCombineTierFactory } from "../../../../typechain/contracts/tier/CombineTierFactory";
import { zeroAddress } from "../../../constants";
import { getEventArgs } from "../../../events";
import { standardIntegrityDeploy } from "../../interpreter/integrity/standardIntegrity/deploy";

export const combineTierDeploy = async (
  deployer: SignerWithAddress,
  config: CombineTierConfigStruct
) => {
  const integrity = await standardIntegrityDeploy();

  const combineTierFactoryFactory = await ethers.getContractFactory(
    "CombineTierFactory"
  );
  const combineTierFactory = (await combineTierFactoryFactory.deploy(
    integrity.address
  )) as CombineTierFactory;
  await combineTierFactory.deployed();

  const { implementation } = (await getEventArgs(
    combineTierFactory.deployTransaction,
    "Implementation",
    combineTierFactory
  )) as ImplementationEventCombineTierFactory["args"];
  assert(
    !(implementation === zeroAddress),
    "implementation combineTier factory zero address"
  );

  const tx = await combineTierFactory.createChildTyped(config);
  const contract = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(tx, "NewChild", combineTierFactory)).child
      ),
      20
    ),
    (await artifacts.readArtifact("CombineTier")).abi,
    deployer
  ) as CombineTier;
  await contract.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  contract.deployTransaction = tx;

  return contract;
};
