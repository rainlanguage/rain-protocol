import { ethers } from "hardhat";
import {
  SaleConstructorConfigStruct,
  SaleFactory,
} from "../../../../typechain/contracts/sale/SaleFactory";

export const saleFactoryDeploy = async (
  saleConstructorConfig: SaleConstructorConfigStruct
) => {
  const saleFactoryFactory = await ethers.getContractFactory("SaleFactory", {});
  const saleFactory = (await saleFactoryFactory.deploy(
    saleConstructorConfig
  )) as SaleFactory;
  await saleFactory.deployed();
  return saleFactory;
};
