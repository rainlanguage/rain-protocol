import type { CombineTier } from "../../typechain/CombineTier";
import type {
  CombineTierFactory,
  ImplementationEvent as ImplementationEventCombineTierFactory,
} from "../../typechain/CombineTierFactory";
import { artifacts, ethers } from "hardhat";
import { getEventArgs } from "../events";
import { zeroAddress } from "../constants";
import { Contract } from "ethers";
import chai from "chai";
const { assert } = chai;

export const combineTierDeploy = async (deployer, config) => {
  const stateBuilderFactory = await ethers.getContractFactory(
    "AllStandardOpsStateBuilder"
  );
  const stateBuilder = await stateBuilderFactory.deploy();
  await stateBuilder.deployed();

  const factoryFactory = await ethers.getContractFactory("CombineTierFactory");
  const factory = (await factoryFactory.deploy(
    stateBuilder.address
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
  ) as CombineTier & Contract;
  await contract.deployed();

  return contract;
};
