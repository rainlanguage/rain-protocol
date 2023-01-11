import { OpMeta } from "../types";

export const maxMeta: OpMeta = {
  name: 'MAX',
  description: 'Inserts the maximum of N values taken from the stack into the stack',
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
  aliases: ['MAXIMUM', 'MAX_OF', 'MAXOF'],
  parameters: [
      {
          name: 'Input',
          spread: true
      }
  ]
}
