import { OpMeta } from "../../types";

export const everyMeta: OpMeta = {
  name: 'EVERY',
  description: 'Inserts the first value of all the values it checks if all of them are non-zero, else inserts zero into the stack.',
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
  aliases: ['AND', '&'],
  parameters: [
      {
          name: 'Input',
          spread: true
      }
  ]
}
