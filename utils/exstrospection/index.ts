import { ethers } from "hardhat";

export function pad(num: number, size: number) {
  let s = num + "";
  while (s.length < size) s = "0" + s;
  return s;
}

export function log(num: number, base: number) {
  return Math.log(num) / Math.log(base);
}

export function roundLog(num: number, base: number) {
  return Math.ceil(log(num, base));
}

export function checkIfIncludesNonStaticOps(bytecode: string) {
  const ops = Buffer.from(ethers.utils.hexlify(bytecode).split("x")[1], "hex");

  const disallowedOps = [
    // https://eips.ethereum.org/EIPS/eip-214#specification
    // CREATE
    0xf0,
    // CREATE2
    0xf5,
    // LOG0
    0xa0,
    // LOG1
    0xa1,
    // LOG2
    0xa2,
    // LOG3
    0xa3,
    // LOG4
    0xa4,
    // SSTORE
    0x55,
    // SELFDESTRUCT
    0xff,
    // CALL
    0xf1,

    // Additional disallowed.
    // SLOAD
    // If SSTORE is disallowed then SLOAD makes no sense
    0x54,
    // DELEGATECALL
    // Not allowing other contracts to modify storage either
    0xf4,
    // CALLCODE
    // Use static call instead
    0xf2,
    // CALL
    // Use static call instead
    0xf1,
  ];

  const pushOps = [
    0x60, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x6b,
    0x6c, 0x6d, 0x6e, 0x6f, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x77,
    0x78, 0x79, 0x7a, 0x7b, 0x7c, 0x7d, 0x7e, 0x7f,
  ];

  for (let i = 0; i < ops.length; i++) {
    const byte = ops[i];
    if (disallowedOps.includes(byte)) {
      // https://docs.soliditylang.org/en/v0.8.13/metadata.html#encoding-of-the-metadata-hash-in-the-bytecode
      // This is a hack that assumes the exact format of the metadata which is
      // NOT correct in all cases. In future we should handle this better by
      // parsing CBOR instead of just skipping a fixed number of bytes.
      if (byte === 0xa2 && i === ops.length - 53) {
        return true;
      }
      return false;
    }
    if (pushOps.includes(byte)) {
      const jump = byte - 0x5f;
      i += jump;
    }
  }
  return true;
}
