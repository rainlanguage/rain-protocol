import { OpMeta } from "../types";

export const modMeta: OpMeta = {
  name: 'MOD',
  description: 'Inserts the mod of N values taken from the stack into the stack',
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
  aliases: ['%'],
  parameters: [
      {
          name: 'Input',
          spread: true
      }
  ]
}
