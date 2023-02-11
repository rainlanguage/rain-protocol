import { ethers } from "hardhat";
import { OrderBook } from "../../../typechain";
import { OrderBookConstructionConfigStruct } from "../../../typechain/contracts/orderbook/OrderBook";
import { generateEvaluableConfig } from "../../interpreter";
import { getRainContractMetaBytes } from "../../meta";

export const deployOrderBook = async (): Promise<OrderBook> => {
  const deployer_ = await generateEvaluableConfig([], []);
  const config_: OrderBookConstructionConfigStruct = {
    deployer: deployer_.deployer,
    callerMeta: getRainContractMetaBytes("orderbook"),
  };
  const orderBookFactory = await ethers.getContractFactory("OrderBook", {});
  const orderBook = (await orderBookFactory.deploy(config_)) as OrderBook;

  return orderBook;
};
