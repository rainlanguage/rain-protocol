import FlowERC20 from "../../../contracts/flow/erc20/FlowERC20Factory.meta.json";
import FlowERC721 from "../../../contracts/flow/erc721/FlowERC721Factory.meta.json";
import FlowERC1155 from "../../../contracts/flow/erc1155/FlowERC1155Factory.meta.json";
import Lobby from "../../../contracts/lobby/LobbyFactory.meta.json";
import Orderbook from "../../../contracts/orderbook/OrderBook.meta.json";
import Sale from "../../../contracts/sale/SaleFactory.meta.json";
import Stake from "../../../contracts/stake/StakeFactory.meta.json";
import CombineTier from "../../../contracts/tier/CombineTierFactory.meta.json";
import AutoApprove from "../../../contracts/verify/auto/AutoApproveFactory.meta.json";
import { deflateSync } from "zlib";
import { format } from "prettier";

/**
 * @public
 * Get deplyable compressed bytes of contract(s) meta
 * 
 * @param contract - Name of a Rain contract, eg "sale", "flowErc20"
 * @returns Deployable bytes as hex string
 */
export const getRainContractMetaBytes = (
  contract: 
    | "sale"
    | "stake"
    | "orderbook"
    | "flow20"
    | "flow721"
    | "flow1155"
    | "lobby"
    | "autoapprove"
    | "combinetier"
): string => {
  let meta
  if (contract === "sale") meta = Sale
  if (contract === "stake") meta = Stake
  if (contract === "orderbook") meta = Orderbook
  if (contract === "flow20") meta = FlowERC20
  if (contract === "flow721") meta = FlowERC721
  if (contract === "flow1155") meta = FlowERC1155
  if (contract === "lobby") meta = Lobby
  if (contract === "autoapprove") meta = AutoApprove
  if (contract === "combinetier") meta = CombineTier

  const content = format(JSON.stringify(meta, null, 4), { parser: "json" })
  const opmetaBytes = Uint8Array.from(deflateSync(content));
  let contractMetaHex = "0x";
  for (let i = 0; i < opmetaBytes.length; i++) {
    contractMetaHex =
      contractMetaHex + opmetaBytes[i].toString(16).padStart(2, "0");
  }
  return contractMetaHex;
};

/**
 * @public
 * Get deployable bytes for any contract meta 
 * 
 * @param contractMeta - Contract meta as an object (json stringified)
 * @returns Deployable bytes as hex string
 */
export const getContractMetaBytes = (contractMeta: object): string => {
  const content = format(JSON.stringify(contractMeta, null, 4), { parser: "json" })
  const opmetaBytes = Uint8Array.from(deflateSync(content));
  let contractMetaHex = "0x";
  for (let i = 0; i < opmetaBytes.length; i++) {
    contractMetaHex =
      contractMetaHex + opmetaBytes[i].toString(16).padStart(2, "0");
  }
  return contractMetaHex;
}