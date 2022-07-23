import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { artifacts, ethers } from "hardhat";
import type {
  CombineTier,
  CombineTierConfigStruct,
} from "../../typechain/CombineTier";
import type {
  CombineTierFactory,
  ImplementationEvent as ImplementationEventCombineTierFactory,
} from "../../typechain/CombineTierFactory";
import { zeroAddress } from "../constants";
import { getEventArgs } from "../events";

export const combineTierDeploy = async (
  deployer: SignerWithAddress,
  config: CombineTierConfigStruct
) => {
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
  ) as CombineTier;
  await contract.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  contract.deployTransaction = tx;

  return contract;
};
