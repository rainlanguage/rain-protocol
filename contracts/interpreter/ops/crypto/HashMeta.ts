import { OpMeta } from "../types";

export const hashMeta: OpMeta = {
  name: 'HASH',
  description: 'Hash (solidity keccak256) value taken from stack and stack the result',
  outputs: 1,
  inputs: {
      startBit: 0,
      endBit: 7
  },
  operand: [
      {
          name: 'Inputs',
          startBit: 0,
          endBit: 7,
          validRange: [[1, 255]]
      }
  ],
  aliases: ['ENCODE', 'ENCRYPT'],
  parameters: [
      {
          name: 'Input',
          spread: true
      }
  ]
}
