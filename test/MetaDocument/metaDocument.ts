import { decodeAllSync } from "cbor";

import { assert } from "chai";
import {
  ContractMeta,
  getAbi,
  getRainContractMetaBytes,
  getRainMetaDocumentFromContract,
  getRainMetaDocumentFromOpmeta,
  getRainterpreterOpMetaBytes,
} from "../../utils";
import { MAGIC_NUMBERS } from "../../utils/meta/cbor";
import { ethers } from "hardhat";

/**
 * Rain Meta Document magic number as hex string
 */
const RainMetaDocument = ethers.utils.hexlify(MAGIC_NUMBERS.RAIN_META_DOCUMENT);
/**
 * Contract Meta V1 magic number as hex string
 */
const ContractMeta = ethers.utils.hexlify(MAGIC_NUMBERS.CONTRACT_META_V1);
/**
 * Solidiy ABI V2 magic number as hex string
 */
const SolidityABI = ethers.utils.hexlify(MAGIC_NUMBERS.SOLIDITY_ABIV2);
/**
 * Ops Meta V1 magic number as hex string
 */
const OpsMeta = ethers.utils.hexlify(MAGIC_NUMBERS.OPS_META_V1);

/**
 * Use a decoded array of Maps from CBOR and return an specific item that met the
 * `compareValue_` in the magic number key (1).
 *
 * @param decodedMaps_ The array obtained from CBOR decode
 * @param magicNumber_ Magic number to found an specific item
 */
const findDocInDecodedArray = (
  decodedMaps_: any[],
  magicNumber_: any
): Map<number, any> | undefined => {
  const magicNumberKey = 1;

  if (decodedMaps_.every((map_) => map_ instanceof Map)) {
    const decodedMaps = decodedMaps_ as Array<Map<number, any>>;
    return decodedMaps.find(
      (elem_) => ethers.utils.hexlify(elem_.get(magicNumberKey)) == magicNumber_
    );
  } else {
    // If a value is not a map, means that does not follow the Rain Meta Document design.
    // See: https://github.com/rainprotocol/metadata-spec/blob/main/README.md#header-name-aliases-cbor-map-keys
    throw new Error("A value in the decoded value is not a map");
  }
};

describe("Contract Rain Meta Document", function () {
  it("should construct a meta document from a contract with the start magic number", async function () {
    // The contract name to generate the Rain Meta Document
    const contractName: ContractMeta = "orderbook";

    // Getting the meta document from an arbitrary contract
    const metaDocument = getRainMetaDocumentFromContract(contractName);

    assert(
      metaDocument.startsWith(RainMetaDocument),
      "The rain meta document does not start with the magic number"
    );
  });

  it("should create a meta document with the correct contract meta", async function () {
    // The contract name to generate the Rain Meta Document
    const contractName: ContractMeta = "flow20";

    // Getting the meta document from an arbitrary contract
    const metaDocument = getRainMetaDocumentFromContract(contractName);

    assert(
      metaDocument.startsWith(RainMetaDocument),
      "The rain meta document does not start with the magic number"
    );

    // The cbor sequence without the magic number.
    const cborSequence = metaDocument.replace(RainMetaDocument, "");

    // This should be the Maps array encoded data
    const dataDecoded = decodeAllSync(cborSequence);

    // Find the contract meta in the decoded values
    const contractMetaMap = findDocInDecodedArray(dataDecoded, ContractMeta);

    // Contract Meta Bytes from the decoded CBOR
    const contractMetaBytes = ethers.utils.hexlify(contractMetaMap.get(0));
    const contentType = contractMetaMap.get(2);
    const contentEncoding = contractMetaMap.get(3);

    // Contract meta Bytes directly from the generator function (?)
    const contractMetaBytesOrigin = getRainContractMetaBytes(contractName);

    assert(
      contractMetaBytes === contractMetaBytesOrigin,
      "Contract meta bytes does not match with the original"
    );

    assert(
      contentType === "application/json",
      "Contract meta does not have the correct content type"
    );
    assert(
      contentEncoding === "deflate",
      "Contract meta does not have the correct encoding type"
    );
  });

  it("should create a meta document with the correct solidity ABI", async function () {
    // The contract name to generate the Rain Meta Document
    const contractName: ContractMeta = "stake";

    // Getting the meta document from an arbitrary contract
    const metaDocument = getRainMetaDocumentFromContract(contractName);

    assert(
      metaDocument.startsWith(RainMetaDocument),
      "The rain meta document does not start with the magic number"
    );

    // The cbor sequence without the magic number.
    const cborSequence = metaDocument.replace(RainMetaDocument, "");

    // This should be the Maps array encoded data
    const dataDecoded = decodeAllSync(cborSequence);

    // Find the solidity ABI map in the decoded values
    const solidityAbiMap = findDocInDecodedArray(dataDecoded, SolidityABI);

    // Solidity ABIv2 Bytes from the decoded CBOR
    const solidityAbiBytes = ethers.utils.hexlify(solidityAbiMap.get(0));
    const contentType = solidityAbiMap.get(2);
    const contentEncoding = solidityAbiMap.get(3);

    // Solidity ABIv2 Bytes directly from the generator function (?)
    const solidityAbiBytesOrigin = getAbi(contractName);

    assert(
      solidityAbiBytes === solidityAbiBytesOrigin,
      "Solidity ABIv2 bytes does not match with the original"
    );

    assert(
      contentType === "application/json",
      "Solidity ABIv2 does not have the correct content type"
    );
    assert(
      contentEncoding === "deflate",
      "Solidity ABIv2 does not have the correct encoding type"
    );
  });

  it("should create a meta document with the correct Ops Meta", async function () {
    // Getting the meta document for the Interpreter
    const metaDocument = getRainMetaDocumentFromOpmeta();

    assert(
      metaDocument.startsWith(RainMetaDocument),
      "The rain meta document does not start with the magic number"
    );

    // The cbor sequence without the magic number.
    const cborSequence = metaDocument.replace(RainMetaDocument, "");

    // This should be the Maps array encoded data
    const dataDecoded = decodeAllSync(cborSequence);

    // Find the Ops Meta map in the decoded values
    const opsMetaMap = findDocInDecodedArray(dataDecoded, OpsMeta);

    // Ops Meta Bytes from the decoded CBOR
    const opsMetaBytes = ethers.utils.hexlify(opsMetaMap.get(0));
    const contentType = opsMetaMap.get(2);
    const contentEncoding = opsMetaMap.get(3);

    // Ops Meta Bytes directly from the generator function (?)
    const opsMetaBytesOrigin = getRainterpreterOpMetaBytes();

    assert(
      opsMetaBytes === opsMetaBytesOrigin,
      "Ops Meta bytes does not match with the original"
    );

    assert(
      contentType === "application/json",
      "Ops Meta does not have the correct content type"
    );
    assert(
      contentEncoding === "deflate",
      "Ops Meta does not have the correct encoding type"
    );
  });
});
