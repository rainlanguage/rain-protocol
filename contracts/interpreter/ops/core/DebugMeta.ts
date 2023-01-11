import { OpMeta } from "../types";

export const debugMeta: OpMeta = {
  name: 'DEBUG',
  description: 'ABI encodes the entire stack and logs it to the hardhat console',
  outputs: 0,
  inputs: 0,
  operand: [
      {
          name: 'Mode',
          description: 'debugging mode',
          startBit: 0,
          endBit: 0
      }
  ],
  aliases: ['LOG', 'CONSOLE', 'CONSOLE_LOG']
}
