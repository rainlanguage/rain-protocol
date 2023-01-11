import { OpMeta } from "../../types";

export const anyMeta: OpMeta = {
  name: 'ANY',
  description: 'Inserts the first non-zero value of all the values it checks if there exists one, else inserts zero into the stack.',
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
  aliases: ['OR', '|'],
  parameters: [
      {
          name: 'Input',
          spread: true
      }
  ]
}
