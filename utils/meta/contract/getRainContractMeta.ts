import Flow from "../../../contracts/flow/basic/Flow.meta.json";
import FlowERC20 from "../../../contracts/flow/erc20/FlowERC20.meta.json";
import FlowERC721 from "../../../contracts/flow/erc721/FlowERC721.meta.json";
import FlowERC1155 from "../../../contracts/flow/erc1155/FlowERC1155.meta.json";
import Lobby from "../../../contracts/lobby/Lobby.meta.json";
import Orderbook from "../../../contracts/orderbook/OrderBook.meta.json";
import Sale from "../../../contracts/sale/Sale.meta.json";
import Stake from "../../../contracts/stake/Stake.meta.json";
import CombineTier from "../../../contracts/tier/CombineTier.meta.json";
import AutoApprove from "../../../contracts/verify/auto/AutoApprove.meta.json";
import ContractMetaSchema from "../../../schema/meta/v0/op.meta.schema.json";
import { deflateSync } from "zlib";
import { format } from "prettier";
import cbor from "cbor" ; 
import { metaFromBytes } from "../general";


export const MAGIC_NUMBERS = {
  META_MAGIC_NUMBER: "0xff0a89c674ee7874" ,
  SOLIDITY_ABIV2: "0xffe5ffb4a3ff2cde" ,
  OPS_META_V1: "0xffe5282f43e495b4" ,
  CONTRACT_META_V1: "0xffc21bbf86cc199b"
}


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

/**
 * @public
 * Get cbor encoded deplyable compressed bytes of a Rain contract meta
 * Spec : https://github.com/rainprotocol/metadata-spec/blob/main/README.md
 * 
 * @param contract - Name of a Rain contract, eg "sale", "flowErc20"
 * @returns Deployable bytes as hex string
 */ 
export const getRainContractMetaCborEncoded = ( 
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

    const contractMeta = getRainContractMetaBytes(contract) 

    const m = new Map();
    m.set(0, contractMeta);  // Payload
    m.set(1, BigInt(MAGIC_NUMBERS.CONTRACT_META_V1));  // contract meta magic number 
    m.set(2, "application/cbor") // content-type

    const contractCbor = cbor.encodeCanonical(m).toString("hex").toLowerCase();  
    
    const contractCborEncoded = MAGIC_NUMBERS.META_MAGIC_NUMBER + contractCbor // contract with rain meta magic number

    return contractCborEncoded



}
