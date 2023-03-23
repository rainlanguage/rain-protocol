import cbor from "cbor";
import { assert } from "chai";
import { ethers } from "hardhat";
import {
  getRainContractMetaBytes,
  getRainterpreterOpMetaBytes,
} from "../../utils";
import {
  encodeCBORContractMeta,
  getAbi,
  getRainMetaDocumentFromContract,
  getRainMetaDocumentFromOpmeta,
} from "../../utils/meta/rainMetaDocument";
import {
  RainMetaDocumentMN,
  ContractMetaMN,
  SolidityABIMN,
  OpsMetaMN,
  findDocInDecodedArray,
  hexToBin,
  hexToDecimal,
  binToDecimal,
  RainDocumentKeys,
  MT,
} from "./cbor.utils";

import type { ContractMeta } from "../../utils/types/contractMeta";

describe("Contract Rain Meta Document", function () {
  it("should construct a meta document from a contract with the start magic number", async function () {
    // The contract name to generate the Rain Meta Document
    const contractName: ContractMeta = "orderbook";

    // Getting the meta document from an arbitrary contract
    const metaDocument = getRainMetaDocumentFromContract(contractName);

    assert(
      metaDocument.startsWith(RainMetaDocumentMN),
      "The rain meta document does not start with the magic number"
    );
  });

  it("should create a meta document with the correct contract meta", async function () {
    // The contract name to generate the Rain Meta Document
    const contractName: ContractMeta = "flow20";

    // Getting the meta document from an arbitrary contract
    const metaDocument = getRainMetaDocumentFromContract(contractName);

    assert(
      metaDocument.startsWith(RainMetaDocumentMN),
      "The rain meta document does not start with the magic number"
    );

    // The cbor sequence without the magic number.
    const cborSequence = metaDocument.replace(RainMetaDocumentMN, "");

    // This should be the Maps array encoded data
    const dataDecoded = cbor.decodeAllSync(cborSequence);

    // Find the contract meta in the decoded values
    const contractMetaMap = findDocInDecodedArray(dataDecoded, ContractMetaMN);

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
      metaDocument.startsWith(RainMetaDocumentMN),
      "The rain meta document does not start with the magic number"
    );

    // The cbor sequence without the magic number.
    const cborSequence = metaDocument.replace(RainMetaDocumentMN, "");

    // This should be the Maps array encoded data
    const dataDecoded = cbor.decodeAllSync(cborSequence);

    // Find the solidity ABI map in the decoded values
    const solidityAbiMap = findDocInDecodedArray(dataDecoded, SolidityABIMN);

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
      metaDocument.startsWith(RainMetaDocumentMN),
      "The rain meta document does not start with the magic number"
    );

    // The cbor sequence without the magic number.
    const cborSequence = metaDocument.replace(RainMetaDocumentMN, "");

    // This should be the Maps array encoded data
    const dataDecoded = cbor.decodeAllSync(cborSequence);

    // Find the Ops Meta map in the decoded values
    const opsMetaMap = findDocInDecodedArray(dataDecoded, OpsMetaMN);

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

  it("should have the correct major type on the payload of the contract meta", async function () {
    // The contract name to generate the Rain Meta Document
    const contractName: ContractMeta = "flow20";

    // Getting the meta document from an arbitrary contract
    const metaDocument = getRainMetaDocumentFromContract(contractName);

    assert(
      metaDocument.startsWith(RainMetaDocumentMN),
      "The rain meta document does not start with the magic number"
    );

    // The cbor sequence without the magic number.
    const cborSequence = metaDocument.replace(RainMetaDocumentMN, "");

    let contractMetaBytesCBOR = encodeCBORContractMeta(contractName);

    assert(
      cborSequence.includes(contractMetaBytesCBOR),
      "The cbor sequence does not include the contract meta bytes"
    );

    // --- MAP PAIRS CHECK

    // Get the first bytes from the Contract Meta bytes and parse to bits
    const mapTypeBin = hexToBin(contractMetaBytesCBOR.slice(0, 2));

    // Removing the previous byte(s)
    contractMetaBytesCBOR = contractMetaBytesCBOR.slice(2);

    // The high-order 3 are the major type.
    const mapType = binToDecimal(mapTypeBin.slice(0, 3));

    // The low-order 5 bits are additional information.
    // Total keys should be used from `0` to `n - 1`.
    // const mapTotalKeys = binToDecimal(mapTypeBin.slice(-5));

    assert(mapType == MT.MAP, "The cbor data do not have the correct map type");

    // --- PAYLOAD CHECK

    // Looking in the map following the Rain Meta Documents design.
    const keyPayload = hexToDecimal(contractMetaBytesCBOR.slice(0, 2));

    // Remove the last byte
    contractMetaBytesCBOR = contractMetaBytesCBOR.slice(2);

    assert(
      keyPayload == RainDocumentKeys.Payload,
      `Wrong key header aliases - expected: "${RainDocumentKeys.Payload}" and got "${keyPayload}"`
    );

    let payloadLength = 0;

    // Get the next byte
    const bytesTypeBin_0 = hexToBin(contractMetaBytesCBOR.slice(0, 2));

    // Remove the last byte
    contractMetaBytesCBOR = contractMetaBytesCBOR.slice(2);

    // The high-order 3 are the major type.
    const bytesType = binToDecimal(bytesTypeBin_0.slice(0, 3));

    assert(
      bytesType == MT.BYTE_STRING,
      "The data payload do not have the correct cbor bytes type"
    );

    // The low-order 5 bits are additional information. For bytes string determined
    // the length of the string byte
    const bytesLength = binToDecimal(bytesTypeBin_0.slice(-5));

    if (bytesLength == 25) {
      // Additional information 25 to indicate that the next two-byte determined the length
      payloadLength = hexToDecimal(contractMetaBytesCBOR.slice(0, 4));
      // Remove the last two bytes
      contractMetaBytesCBOR = contractMetaBytesCBOR.slice(4);
    } else {
      // Otherwise, "the number of bytes in the string is equal to the argument."
      // Which means that the low-order 5 bits itself are the length
      payloadLength = bytesLength;
    }

    const payloadData = contractMetaBytesCBOR.slice(0, payloadLength * 2);

    // Getting the originalRain Contract Meta bytes without the init '0x'
    const contractMetaBytes = getRainContractMetaBytes(contractName).slice(2);

    assert(payloadData == contractMetaBytes, "The payload data is malformed");
  });
});
