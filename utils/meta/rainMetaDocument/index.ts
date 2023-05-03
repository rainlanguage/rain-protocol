import { artifacts } from "hardhat";
import { ContractMeta } from "../../types/contractMeta";
import { MAGIC_NUMBERS, cborEncode } from "../cbor";
import { deflateJson } from "../general";
import { arrayify, solidityKeccak256 } from "ethers/lib/utils";
import { getRainContractMetaBytes } from "../contract/getRainContractMeta";
import { getRainterpreterOpMetaBytes } from "../op/allStandardOpMeta";

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

  const contractMetaEncoded = encodeCBORContractMeta(contract);

  const abiEncoded = encodeCBORAbiV2(contract);

  // Contract document magic number plus each encoded data
  return metaDocumentHex + contractMetaEncoded + abiEncoded;
};

/**
 * @public
 * Get cbor encoded deployable compressed bytes of a the OpMeta.
 *
 * Encode the `Op Meta` with CBOR and concanate it with the `metaDocumentHex` to
 * generate the Rain meta document.
 *
 * See more: https://github.com/rainprotocol/metadata-spec/blob/main/README.md
 *
 * @returns CBOR sequence as hex string with the Rain Prefix
 */
export const getRainMetaDocumentFromOpmeta = (): string => {
  // Prefixes every rain meta document as an hex string
  const metaDocumentHex =
    "0x" + MAGIC_NUMBERS.RAIN_META_DOCUMENT.toString(16).toLowerCase();

  const opsMetaEncoded = encodeCBOROpMeta();

  // Contract document magic number plus each encoded data
  return metaDocumentHex + opsMetaEncoded;
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

/**
 * From a given contract name encoded their contract meta with CBOR following
 * the Rain Documents Design.
 * @returns An hex string that represent the data encoded with CBOR
 */
export const encodeCBORContractMeta = (contract: ContractMeta) => {
  // -- Encoding ContractMeta with CBOR
  // Obtain Contract Meta as string (Deflated JSON) and parse it to an ArrayBuffer

  const contractMeta = arrayify(getRainContractMetaBytes(contract)).buffer;
  return cborEncode(
    contractMeta,
    MAGIC_NUMBERS.CONTRACT_META_V1,
    "application/json",
    {
      contentEncoding: "deflate",
    }
  );
};

/**
 * From a given contract name encoded their ABIv2 with CBOR following
 * the Rain Documents Design.
 * @returns An hex string that represent the data encoded with CBOR
 */
export const encodeCBORAbiV2 = (contract: ContractMeta) => {
  // -- Enconding Contract JSON ABIv2 with CBOR
  // Obtain ABIv2 as string (Deflated JSON) and parse it to an ArrayBuffer

  const abiJson = arrayify(getAbi(contract)).buffer;
  return cborEncode(abiJson, MAGIC_NUMBERS.SOLIDITY_ABIV2, "application/json", {
    contentEncoding: "deflate",
  });
};

/**
 * Encoded the OpMeta with CBOR following the Rain Documents Design.
 * @returns An hex string that represent the data encoded with CBOR
 */
export const encodeCBOROpMeta = () => {
  // -- Encoding ContractMeta with CBOR
  // Obtain Contract Meta as string (Deflated JSON) and parse it to an ArrayBuffer
  const opsMeta = arrayify(getRainterpreterOpMetaBytes()).buffer;

  return cborEncode(opsMeta, MAGIC_NUMBERS.OPS_META_V1, "application/json", {
    contentEncoding: "deflate",
  });
};

/**
 * @returns An hex string that is the keccak256 has of the contract meta
 */
export const getCallerMetaForContract = (
  contractName_: ContractMeta
): string => {
  return solidityKeccak256(
    ["bytes"],
    [getRainMetaDocumentFromContract(contractName_)]
  );
};
