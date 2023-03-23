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
import ContractMetaSchema from "../../../schema/meta/v0/contract.meta.schema.json";
import { deflateJson, metaFromBytes, validateMeta } from "../general";
import { artifacts } from "hardhat";
import _ from "lodash";

import type { BytesLike } from "ethers/lib/utils";
import type { ContractMeta } from "../../types/contractMeta";

/**
 * @public
 * Get deplyable compressed bytes of a Rain contract meta
 *
 * @param contract - Name of a Rain contract, eg "sale", "flowErc20"
 * @returns Deployable bytes as hex string
 */
export const getRainContractMetaBytes = (contract: ContractMeta): string => {
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
  if (!validateMeta(meta, ContractMetaSchema))
    throw new Error("invalid contract meta");
  return deflateJson(meta);
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
  bytes: BytesLike,
  path?: string
) => {
  return metaFromBytes(bytes, ContractMetaSchema, path);
};

/**
 * @public
 * Get cbor encoded deployable compressed bytes of a Rain contract.
 *
 * Encode the `Contract meta v1` and `Solidity ABIv2` with CBOR, and concanate
 * them to generate a CBOR sequence with the Rain meta document Prefix.
 *
 * See more: https://github.com/rainprotocol/metadata-spec/blob/main/README.md
 *
 * @param contract - Name of a Rain contract, eg "sale", "flowErc20"
 * @returns CBOR sequence as hex string with the Rain Prefix
 */
export const getRainMetaDocumentFromContract = (
  contract: ContractMeta
): string => {
  // Prefixes every rain meta document as an hex string
  const metaDocumentHex =
    "0x" + MAGIC_NUMBERS.RAIN_META_DOCUMENT.toString(16).toLowerCase();

  // -- Encoding ContractMeta with CBOR
  // Obtain Contract Meta as string (Deflated JSON) and parse it to an ArrayBuffer
  const contractMeta = arrayify(getRainContractMetaBytes(contract)).buffer;
  // console.log("contractMeta : " , contractMeta )
  // console.log("getRainContractMetaBytes(contract) : " , getRainContractMetaBytes(contract) )

  const contractMetaEncoded = cborEncode(
    contractMeta,
    MAGIC_NUMBERS.CONTRACT_META_V1,
    "application/json",
    {
      contentEncoding: "deflate",
    }
  );

  // console.log("contractMetaEncoded : " , contractMetaEncoded )

  // -- Enconding Contract JSON ABIv2 with CBOR
  // Obtain ABIv2 as string (Deflated JSON) and parse it to an ArrayBuffer
  const abiJson = arrayify(getAbi(contract)).buffer;
  const abiEncoded = cborEncode(
    abiJson,
    MAGIC_NUMBERS.SOLIDITY_ABIV2,
    "application/json",
    {
      contentEncoding: "deflate",
    }
  );

  // Contract document magic number plus each encoded data
  return metaDocumentHex + contractMetaEncoded + abiEncoded;
};

/**
 * @public
 * Read the artifacts and obtain the ABI from a given `contractName_` to encode as
 * a deflated JSON.
 *
 * @param contractName_ The contract that will be read to get the ABI
 * @returns The  deflated ABI JSON as hex string.
 */
export const getAbi = (contractName_: ContractMeta): string => {
  let name: string;

  if (contractName_ === "sale") name = "Sale";
  if (contractName_ === "stake") name = "Stake";
  if (contractName_ === "orderbook") name = "OrderBook";
  if (contractName_ === "flow") name = "Flow";
  if (contractName_ === "flow20") name = "FlowERC20";
  if (contractName_ === "flow721") name = "FlowERC721";
  if (contractName_ === "flow1155") name = "FlowERC1155";
  if (contractName_ === "lobby") name = "Lobby";
  if (contractName_ === "autoapprove") name = "AutoApprove";
  if (contractName_ === "combinetier") name = "CombineTier";

  if (!name) throw new Error("Invalid contract name");

  const abiJSON = artifacts.readArtifactSync(name).abi;

  return deflateJson(abiJSON);
};

export const validateContractMetaAgainstABI = (
  contractName_: ContractMeta
): boolean => {
  let meta, name;

  if (contractName_ === "sale") {
    (meta = Sale), (name = "Sale");
  }
  if (contractName_ === "stake") {
    (meta = Stake), (name = "Stake");
  }
  if (contractName_ === "orderbook") {
    (meta = Orderbook), (name = "Orderbook");
  }
  if (contractName_ === "flow") {
    (meta = Flow), (name = "Flow");
  }
  if (contractName_ === "flow20") {
    (meta = FlowERC20), (name = "FlowERC20");
  }
  if (contractName_ === "flow721") {
    (meta = FlowERC721), (name = "FlowERC721");
  }
  if (contractName_ === "flow1155") {
    (meta = FlowERC1155), (name = "FlowERC1155");
  }
  if (contractName_ === "lobby") {
    (meta = Lobby), (name = "Lobby");
  }
  if (contractName_ === "autoapprove") {
    (meta = AutoApprove), (name = "AutoApprove");
  }
  if (contractName_ === "combinetier") {
    (meta = CombineTier), (name = "CombineTier");
  }

  if (!validateMeta(meta, ContractMetaSchema))
    throw new Error("invalid contract meta");

  if (!name) throw new Error("Invalid contract name");

  const abiJSON = artifacts.readArtifactSync(name).abi;

  // Get methods from meta
  const methods = meta.methods;

  for (let i = 0; i < methods.length; i++) {
    // Eval consistenct for meta and abi
    const method = methods[i];

    if (method.inputs) {
      const inputs = method.inputs;
      // Check for inputs
      for (let j = 0; j < inputs.length; j++) {
        if (inputs[j].abiName != _.get(abiJSON, inputs[j].path).name) {
          throw new Error(
            `mismatch input name for method ${method.name},
                        expected  ${_.get(abiJSON, inputs[j].path).name}
                        got       ${inputs[j].abiName}`
          );
        }
      }
    }

    if (method.expressions) {
      const expressions = method.expressions;
      //Check for expressions
      for (let k = 0; k < expressions.length; k++) {
        if (
          expressions[k].abiName != _.get(abiJSON, expressions[k].path).name
        ) {
          throw new Error(
            `mismatch expression name for method ${method.name},
                        expected  ${_.get(abiJSON, expressions[k].path).name}
                        got       ${expressions[k].abiName}`
          );
        }
      }
    }
  }

  return true;
};