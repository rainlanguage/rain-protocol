import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { Overrides } from "ethers";
import { artifacts, ethers } from "hardhat";
import { StandardIntegrity } from "../../typechain/StandardIntegrity";
import { ReadWriteTier } from "../../typechain/ReadWriteTier";
import { RedeemableERC20 } from "../../typechain/RedeemableERC20";
import { RedeemableERC20Factory } from "../../typechain/RedeemableERC20Factory";
import {
  ConstructEvent,
  Sale,
  SaleConfigStruct,
  SaleRedeemableERC20ConfigStruct,
} from "../../typechain/Sale";
import { SaleFactory } from "../../typechain/SaleFactory";
import { getEventArgs } from "../events";

export const saleDeploy = async (
  signers: SignerWithAddress[],
  deployer: SignerWithAddress,
  saleFactory: SaleFactory,
  config: SaleConfigStruct,
  saleRedeemableERC20Config: SaleRedeemableERC20ConfigStruct,
  ...args: Overrides[]
): Promise<[Sale, RedeemableERC20]> => {
  const txDeploy = await saleFactory.createChildTyped(
    config,
    saleRedeemableERC20Config,
    ...args
  );

  const sale = new ethers.Contract(
    ethers.utils.hexZeroPad(
      ethers.utils.hexStripZeros(
        (await getEventArgs(txDeploy, "NewChild", saleFactory)).child
      ),
      20 // address bytes length
    ),
    (await artifacts.readArtifact("Sale")).abi,
    deployer
  ) as Sale;

  if (!ethers.utils.isAddress(sale.address)) {
    throw new Error(
      `invalid sale address: ${sale.address} (${sale.address.length} chars)`
    );
  }

  await sale.deployed();

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  sale.deployTransaction = txDeploy;

  let token = new ethers.Contract(
    await sale.token(),
    (await artifacts.readArtifact("RedeemableERC20")).abi
  ) as RedeemableERC20;

  token = token.connect(signers[0]); // need to do this for some reason

  return [sale, token];
};

export const saleDependenciesDeploy = async () => {
  const integrityFactory = await ethers.getContractFactory(
    "StandardIntegrity"
  );
  const integrity =
    (await integrityFactory.deploy()) as StandardIntegrity;
  await integrity.deployed();

  const redeemableERC20FactoryFactory = await ethers.getContractFactory(
    "RedeemableERC20Factory",
    {}
  );
  const redeemableERC20Factory =
    (await redeemableERC20FactoryFactory.deploy()) as RedeemableERC20Factory;
  await redeemableERC20Factory.deployed();

  const readWriteTierFactory = await ethers.getContractFactory("ReadWriteTier");
  const readWriteTier = (await readWriteTierFactory.deploy()) as ReadWriteTier;
  await readWriteTier.deployed();

  const saleConstructorConfig = {
    maximumSaleTimeout: 10000,
    maximumCooldownDuration: 1000,
    redeemableERC20Factory: redeemableERC20Factory.address,
    vmIntegrity: integrity.address,
  };
  const saleFactoryFactory = await ethers.getContractFactory("SaleFactory", {});
  const saleFactory = (await saleFactoryFactory.deploy(
    saleConstructorConfig
  )) as SaleFactory;
  await saleFactory.deployed();

  const { implementation, sender } = await getEventArgs(
    saleFactory.deployTransaction,
    "Implementation",
    saleFactory
  );

  assert(sender === (await ethers.getSigners())[0].address, "wrong sender");

  const saleProxy = new ethers.Contract(
    implementation,
    (await artifacts.readArtifact("Sale")).abi
  ) as Sale;

  const { sender: senderProxy, config } = (await getEventArgs(
    saleFactory.deployTransaction,
    "Construct",
    saleProxy
  )) as ConstructEvent["args"];

  assert(senderProxy === saleFactory.address, "wrong proxy sender");
  assert(
    config.redeemableERC20Factory === redeemableERC20Factory.address,
    "wrong redeemableERC20Factory in SaleConstructorConfig"
  );

  return {
    redeemableERC20FactoryFactory,
    redeemableERC20Factory,
    readWriteTierFactory,
    readWriteTier,
    saleConstructorConfig,
    saleFactoryFactory,
    saleFactory,
    saleProxy,
    integrity,
  };
};
