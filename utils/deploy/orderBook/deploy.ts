import { ethers } from "hardhat";
import { OrderBook } from "../../../typechain";
import { InterpreterCallerV1ConstructionConfigStruct } from "../../../typechain/contracts/flow/FlowCommon";

import { getRainMetaDocumentFromContract } from "../../meta";
import { getTouchDeployer } from "../interpreter/shared/rainterpreterExpressionDeployer/deploy";

export const deployOrderBook = async (): Promise<OrderBook> => {
  const touchDeployer = await getTouchDeployer();
  const config_: InterpreterCallerV1ConstructionConfigStruct = {
    meta: getRainMetaDocumentFromContract("orderbook"),
    deployer: touchDeployer.address,
  };
  const orderBookFactory = await ethers.getContractFactory("OrderBook", {});
  const orderBook = (await orderBookFactory.deploy(config_)) as OrderBook;

  return orderBook;
};
