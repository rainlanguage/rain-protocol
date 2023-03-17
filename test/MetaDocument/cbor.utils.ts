import { ethers } from "hardhat";
import { MAGIC_NUMBERS } from "../../utils/meta/cbor";
/**
 * CBOR Major Types.
 *
 * https://www.rfc-editor.org/rfc/rfc8949#name-major-types
 */
export enum MajorTypes {
  /**
   * An unsigned integer
   */
  TYPE_0 = "000",

  /**
   * A negative integer
   */
  TYPE_1 = "001",

  /**
   * A byte string
   */
  TYPE_2 = "010",

  /**
   * A text string
   */
  TYPE_3 = "011",

  /**
   * An array of data items
   */
  TYPE_4 = "100",

  /**
   * A map of pairs of data items
   */
  TYPE_5 = "101",

  /**
   * A tagged data item
   */
  TYPE_6 = "110",

  /**
   * Floating-point numbers and simple values, as well as the "break" stop code
   */
  TYPE_7 = "111",
}

/**
 * https://github.com/rainprotocol/specs/blob/main/metadata.md#header-name-aliases-cbor-map-keys
 */
export enum RainDocumentKeys {
  Payload,
  MagicNumber,
  ContentType,
  ContentEncoding,
  ContentLanguage,
}

/**
 * Rain Meta Document magic number as hex string
 */
export const RainMetaDocumentMN = ethers.utils.hexlify(
  MAGIC_NUMBERS.RAIN_META_DOCUMENT
);
/**
 * Contract Meta V1 magic number as hex string
 */
export const ContractMetaMN = ethers.utils.hexlify(
  MAGIC_NUMBERS.CONTRACT_META_V1
);
/**
 * Solidiy ABI V2 magic number as hex string
 */
export const SolidityABIMN = ethers.utils.hexlify(MAGIC_NUMBERS.SOLIDITY_ABIV2);
/**
 * Ops Meta V1 magic number as hex string
 */
export const OpsMetaMN = ethers.utils.hexlify(MAGIC_NUMBERS.OPS_META_V1);

/**
 * Use a decoded array of Maps from CBOR and return an specific item that met the
 * `compareValue_` in the magic number key (1).
 *
 * @param decodedMaps_ The array obtained from CBOR decode
 * @param magicNumber_ Magic number to found an specific item
 */
export const findDocInDecodedArray = (
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

export const hexToBin = (hex_: string) => {
  return parseInt(hex_, 16).toString(2).padStart(8, "0");
};

export const binToDecimal = (bin_: string) => {
  return parseInt(bin_, 2);
};

export const hexToDecimal = (hex_: string) => {
  return parseInt(hex_, 16);
};
