import cbor from "cbor";
import { strict as assert } from "assert";

import { getAbi } from "../../utils/meta/rainMetaDocument";
import { arrayify } from "ethers/lib/utils";
import { MT, binToDecimal, hexToBin } from "./cbor.utils";

import type { ContractMeta } from "../../utils/types/contractMeta";

describe("CBOR JS Check types", function () {
  it("should have the correct CBOR type on the payload using ArrayBuffer", async function () {
    // A given contract
    const contractName: ContractMeta = "orderbook";

    // Get the ArrayBufferLike from the Uint8Array expression
    const dataU8A = arrayify(getAbi(contractName)); // Uint8Array
    const dataAB = dataU8A.buffer; // ArrayBuffer

    // Just a check about the JS types obtained
    assert(dataAB.constructor === ArrayBuffer);

    // Encoding with canonical way the ArrayBuffer
    const encodedAB = cbor
      .encodeCanonical(dataAB)
      .toString("hex")
      .toLowerCase();

    // Obtained the byte type (as hexadecimal and as bits)
    const byteTypeHex = encodedAB.slice(0, 2);
    const byteTypeBin = hexToBin(byteTypeHex);

    // The high-order 3 are the major type (as bits).
    const majorType = binToDecimal(byteTypeBin.slice(0, 3));

    // The low-order 5 bits are additional information (as bits).
    // const addInfoType = byteTypeBin.slice(-5);

    // https://www.rfc-editor.org/rfc/rfc8949#section-3.1-2.6
    assert(majorType === MT.BYTE_STRING, "The major type is not a byte string");
  });

  it("should have the correct CBOR type on the payload using Uint8Array", async function () {
    // A given contract
    const contractName: ContractMeta = "orderbook";

    // Get the ArrayBufferLike from the Uint8Array expression
    const dataU8A = arrayify(getAbi(contractName)); // Uint8Array

    // Just a check about the JS types obtained
    assert(dataU8A.constructor === Uint8Array);

    // Encoding with canonical way the Uint8Array
    const encodedU8A = cbor
      .encodeCanonical(dataU8A)
      .toString("hex")
      .toLowerCase();

    // Obtained the byte type (as hexadecimal and as bits)
    const byteTypeHex = encodedU8A.slice(0, 2);
    const byteTypeBin = hexToBin(byteTypeHex);

    // The high-order 3 are the major type (as bits).
    const majorType = binToDecimal(byteTypeBin.slice(0, 3));

    // The low-order 5 bits are additional information (as bits).
    // const addInfoType = byteTypeBin.slice(-5);

    // https://www.rfc-editor.org/rfc/rfc8949#name-tagging-of-items
    assert(majorType === MT.TAG, "The major type is not a tag item");
  });
});
