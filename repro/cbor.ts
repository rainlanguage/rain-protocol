import cbor from "cbor";
import { ethers } from "ethers";

const ABIMagicNumber = BigInt(0xffe5ffb4a3ff2cden);

// Encoding using an number literal
const abiMap_0 = new Map();
abiMap_0.set(0, 0x12345678); // Payload
abiMap_0.set(1, ABIMagicNumber); // Magic number
abiMap_0.set(2, "application/json"); // Content-Type
abiMap_0.set(3, "deflate"); // Content-Type

const abiEncoded_0 = cbor
  .encodeCanonical(abiMap_0)
  .toString("hex")
  .toLowerCase();

console.log("abiEncoded_0: ", abiEncoded_0);

// Encoding using an ArrayBuffer
const paylod = ethers.utils.arrayify(0x12345678).buffer;

const abiMap_1 = new Map();
abiMap_1.set(0, paylod); // Payload
abiMap_1.set(1, ABIMagicNumber); // Magic number
abiMap_1.set(2, "application/json"); // Content-Type
abiMap_1.set(3, "deflate"); // Content-Type

const abiEncoded_1 = cbor
  .encodeCanonical(abiMap_1)
  .toString("hex")
  .toLowerCase();

console.log("abiEncoded_1: ", abiEncoded_1);

console.log("is equal?: ", abiEncoded_0 == abiEncoded_1);
// 
/**
 - From design example:
a4001a12345678011bffe5ffb4a3ff2cde02706170706c69636174696f6e2f6a736f6e03676465666c617465

a4
  00
  1a 12345678
  01
  1b ffe5ffb4a3ff2cde
  02
  70
    6170706c69636174696f6e2f6a736f6e
  03
  67
    6465666c617465
*/

/**
 - Using ArrayBuffer:
a4004412345678011bffe5ffb4a3ff2cde02706170706c69636174696f6e2f6a736f6e03676465666c617465

a4
  00
  44 12345678
  01
  1b ffe5ffb4a3ff2cde
  02
  70
    6170706c69636174696f6e2f6a736f6e
  03
  67
    6465666c617465
 */

// 
