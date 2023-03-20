import { ethers } from "hardhat";
import {
  OrderBook as OrderBookType,
  RainterpreterExpressionDeployer,
} from "../../typechain";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../typechain/contracts/factory/CloneFactory";
import { getRainMetaDocumentFromContract } from "../../utils";
import { registerContract } from "../utils";

export const deployOrderbook = async (
  deployer_: RainterpreterExpressionDeployer
) => {
  const orderBookFactory = await ethers.getContractFactory("OrderBook");

  const config: DeployerDiscoverableMetaV1ConstructionConfigStruct = {
    meta: getRainMetaDocumentFromContract("orderbook"),
    deployer: deployer_.address,
  };

  const OrderBook = (await orderBookFactory.deploy(config)) as OrderBookType;

  registerContract("OrderBook", OrderBook.address, config);
};
