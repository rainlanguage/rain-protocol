import Flow from "../../../contracts/flow/basic/FlowFactory.meta.json";
import FlowERC20 from "../../../contracts/flow/erc20/FlowERC20Factory.meta.json";
import FlowERC721 from "../../../contracts/flow/erc721/FlowERC721Factory.meta.json";
import FlowERC1155 from "../../../contracts/flow/erc1155/FlowERC1155Factory.meta.json";
import Lobby from "../../../contracts/lobby/Lobby.meta.json";
import Orderbook from "../../../contracts/orderbook/OrderBook.meta.json";
import Sale from "../../../contracts/sale/SaleFactory.meta.json";
import Stake from "../../../contracts/stake/StakeFactory.meta.json";
import CombineTier from "../../../contracts/tier/CombineTierFactory.meta.json";
import AutoApprove from "../../../contracts/verify/auto/AutoApproveFactory.meta.json";
import ContractMetaSchema from "../../../schema/meta/v0/op.meta.schema.json";
import { deflateSync } from "zlib";
import { format } from "prettier";
import { metaFromBytes } from "../general";

/**
 * @public
 * Get deplyable compressed bytes of a Rain contract meta
 *
 * @param contract - Name of a Rain contract, eg "sale", "flowErc20"
 * @returns Deployable bytes as hex string
 */
export const getRainContractMetaBytes = (
  contract:
    | "sale"
    | "stake"
    | "orderbook"
    | "flow"
    | "flow20"
    | "flow721"
    | "flow1155"
    | "lobby"
    | "autoapprove"
    | "combinetier"
): string => {
  let meta;
  if (contract === "sale") meta = Sale;
  if (contract === "stake") meta = Stake;
  if (contract === "orderbook") meta = Orderbook;
  if (contract === "flow") meta = Flow;
  if (contract === "flow20") meta = FlowERC20;
  if (contract === "flow721") meta = FlowERC721;
  if (contract === "flow1155") meta = FlowERC1155;
  if (contract === "lobby") meta = Lobby;
  if (contract === "autoapprove") meta = AutoApprove;
  if (contract === "combinetier") meta = CombineTier;

  const content = format(JSON.stringify(meta, null, 4), { parser: "json" });
  const bytes = Uint8Array.from(deflateSync(content));
  let hex = "0x";
  for (let i = 0; i < bytes.length; i++) {
    hex = hex + bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
};

/**
 * @public
 * Decompress and convert bytes to one of Rain's contract metas
 *
 * @param bytes - Bytes to decompress and convert back to json meta
 * @param path - Path to write the results to if having the output as a json file is desired, won't write to file if not provided.
 * @returns Rain contract Meta as object
 */
export const getRainContractMetaFromBytes = (
  bytes: string | Uint8Array,
  path?: string
) => {
  return metaFromBytes(bytes, ContractMetaSchema, path);
};
