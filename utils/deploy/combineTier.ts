import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { artifacts, ethers } from "hardhat";
import type { CombineTier, CombineTierFactory } from "../../typechain";
import { CombineTierConfigStruct } from "../../typechain/contracts/tier/CombineTier";
import { ImplementationEvent as ImplementationEventCombineTierFactory } from "../../typechain/contracts/tier/CombineTierFactory";
import { zeroAddress } from "../constants";
import { getEventArgs } from "../events";

export const combineTierDeploy = async (
  deployer: SignerWithAddress,
  config: CombineTierConfigStruct
) => {
  const integrityFactory = await ethers.getContractFactory("StandardIntegrity");
  const integrity = await integrityFactory.deploy();
  await integrity.deployed();

  const factoryFactory = await ethers.getContractFactory("CombineTierFactory");
  const factory = (await factoryFactory.deploy(
    integrity.address
  )) as CombineTierFactory;
  await factory.deployed();

  const { implementation } = (await getEventArgs(
    factory.deployTransaction,
    "Implementation",
    factory
  )) as ImplementationEventCombineTierFactory["args"];
  assert(
    !(implementation === zeroAddress),
    "implementation combineTier factory zero address"
  );

  const tx = await factory.createChildTyped(config);
  const contract = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(tx, "NewChild", factory)).child
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
