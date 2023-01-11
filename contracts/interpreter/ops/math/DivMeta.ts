import { OpMeta } from "../types";

export const divMeta: OpMeta = {
  name: 'DIV',
  description: 'Inserts the result of divide of N values taken from the stack into the stack',
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
  aliases: ['/', '÷', 'DIVIDE'],
  parameters: [
      {
          name: 'Input',
          spread: true
      }
  ]
}
