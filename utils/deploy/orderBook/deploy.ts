import { ethers } from "hardhat";
import { OrderBook } from "../../../typechain";
import { DeployerDiscoverableMetaV1ConstructionConfigStruct } from "../../../typechain/contracts/factory/CloneFactory";

import { getRainMetaDocumentFromContract } from "../../meta";
import { getTouchDeployer } from "../interpreter/shared/rainterpreterExpressionDeployer/deploy";

export const deployOrderBook = async (): Promise<OrderBook> => {
  const touchDeployer = await getTouchDeployer();
  const config_: DeployerDiscoverableMetaV1ConstructionConfigStruct = {
    meta: getRainMetaDocumentFromContract("orderbook"),
    deployer: touchDeployer.address,
  };
  const orderBookFactory = await ethers.getContractFactory("OrderBook", {});
  const orderBook = (await orderBookFactory.deploy(config_)) as OrderBook;

  return orderBook;
};
