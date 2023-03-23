import { ethers } from "hardhat";
import { CloneFactory, RainterpreterExpressionDeployer } from "../../typechain";
import {
  getRainMetaDocumentFromContract,
  redeemableERC20DeployImplementation,
} from "../../utils";
import { registerContract } from "../utils";
import {
  Sale as SaleType,
  SaleConstructorConfigStruct,
} from "../../typechain/contracts/sale/Sale";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../typechain/contracts/factory/CloneFactory";

export const deploySale = async (
  deployer_: RainterpreterExpressionDeployer,
  cloneFactory_: CloneFactory,
  maximumSaleTimeout_: number
) => {
  const saleFactory = await ethers.getContractFactory("Sale");

  const deployerDiscoverableMetaConfig: DeployerDiscoverableMetaV1ConstructionConfigStruct =
    {
      meta: getRainMetaDocumentFromContract("sale"),
      deployer: deployer_.address,
    };

  const RedeemableERC20 = await redeemableERC20DeployImplementation();

  await RedeemableERC20.deployed();

  const saleConstructorConfig: SaleConstructorConfigStruct = {
    maximumSaleTimeout: maximumSaleTimeout_,
    cloneFactory: cloneFactory_.address,
    redeemableERC20Implementation: RedeemableERC20.address,
    deployerDiscoverableMetaConfig: deployerDiscoverableMetaConfig,
  };

  const Sale = (await saleFactory.deploy(saleConstructorConfig)) as SaleType;

  // RedeemableERC20 does not have args !!!
  registerContract("RedeemableERC20", RedeemableERC20.address);
  registerContract("Sale", Sale.address, saleConstructorConfig);
};
