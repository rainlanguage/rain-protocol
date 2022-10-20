import { ethers } from "hardhat";
import { OrderBookIntegrity } from "../../../../typechain/contracts/orderbook/OrderBookIntegrity";

export const orderBookIntegrityDeploy = async () => {
  const integrityFactory = await ethers.getContractFactory(
    "OrderBookIntegrity"
  );
  const integrity = (await integrityFactory.deploy()) as OrderBookIntegrity;
  await integrity.deployed();
  return integrity;
};
