import cbor from "cbor";

/**
 * Magic numbers used to identify Rain documents. This use `BigInt` with their
 * literal numbers.
 *
 * See more abour Magic numbers:
 * https://github.com/rainprotocol/metadata-spec/blob/main/README.md
 */
export const MAGIC_NUMBERS = {
  /**
   * Prefixes every rain meta document
   */
  RAIN_META_DOCUMENT: BigInt(0xff0a89c674ee7874n),
  /**
   * Solidity ABIv2
   */
  SOLIDITY_ABIV2: BigInt(0xffe5ffb4a3ff2cden),
  /**
   * Ops meta v1
   */
  OPS_META_V1: BigInt(0xffe5282f43e495b4n),
  /**
   * Contract meta v1
   */
  CONTRACT_META_V1: BigInt(0xffc21bbf86cc199bn),
};

/**
 * @public
 * Use the data provided to encode it using CBOR and following the Rain design.
 *
 * The payload could be `any` type, but only some are typed safe. When use this
 * function should pass the values with their "truly" expected type. For binary
 * data (like Deflated JSONs) is recommended use ArrayBuffers.
 *
 * See more: https://github.com/rainprotocol/metadata-spec/blob/main/README.md
 *
 * @param payload_ Data as payload to be added with enconding
 * @param magicNumber_ The known magic number work as filter on the design
 * @param contentType_ The type of the payload content
 * @param options_ The options allow to describe the encoding or language of the
 * content. No encoding means the payload is to be read literally as per `contentType_`
 *
 * @returns The data encoded with CBOR as an hex string.
 */
export const cborEncode = (
  payload_: string | number | Uint8Array | ArrayBuffer,
  magicNumber_: bigint,
  contentType_: string,
  options_?: {
    contentEncoding?: string;
    contentLanguage?: string;
  }
): string => {
  const m = new Map();
  m.set(0, payload_); // Payload
  m.set(1, magicNumber_); // Magic number
  m.set(2, contentType_); // Content-Type

  if (options_) {
    if (options_.contentEncoding) {
      m.set(3, options_.contentEncoding); // Content-Encoding
    }

    if (options_.contentLanguage) {
      m.set(4, options_.contentLanguage); // Content-Language
    }
  }

  return cbor.encodeCanonical(m).toString("hex").toLowerCase();
};

/**
 * Use CBOR to decode from a given value.
 *
 * This will try to decode all from the given value, allowing to decoded CBOR
 * sequences. Always will return an array with the decoded results.
 *
 * @param dataEncoded_ The data to be decoded
 * @returns An array with the decoded data.
 */
export const cborDecode = (dataEncoded_: string): Array<any> => {
  return cbor.decodeAllSync(dataEncoded_);
};

/**
 * Use a given `dataEncoded_` as hex string and decoded it following the Rain
 * enconding design.
 *
 * @param dataEncoded_ The data to be decoded
 * @returns An array with the values decoded.
 */
export const decodeRainMetaDocument = (dataEncoded_: string): Array<any> => {
  const metaDocumentHex =
    "0x" + MAGIC_NUMBERS.RAIN_META_DOCUMENT.toString(16).toLowerCase();

  dataEncoded_ = dataEncoded_.toLowerCase().startsWith("0x")
    ? dataEncoded_
    : "0x" + dataEncoded_;

  if (!dataEncoded_.startsWith(metaDocumentHex)) {
    throw new Error(
      "Invalid data. Does not start with meta document magic number."
    );
  }

  return cborDecode(dataEncoded_.replace(metaDocumentHex, ""));
};
