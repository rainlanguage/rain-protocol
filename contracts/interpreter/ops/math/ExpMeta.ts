import { OpMeta } from "../types";

export const expMeta: OpMeta = {
  name: 'EXP',
  description: 'Inserts the result of exponention of N values taken from the stack into the stack',
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
          validRange: [[2, 255]]
      }
  ],
  aliases: [
      '^',
      'POW',
      'POWER',
      'EXPONENTION',
  ],
  parameters: [
      {
          name: 'Input',
          spread: true
      }
  ]
}
