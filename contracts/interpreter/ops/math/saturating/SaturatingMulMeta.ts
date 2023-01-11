import { OpMeta } from "../../types";

export const saturatingMulMeta: OpMeta = {
  name: 'SATURATING_MUL',
  description: 'Inserts multiplied result of the specified items from the stack and if prevernts reverts if the result goes above max 256 bit size',
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
  aliases: ['SATURATINGMUL', 'SAT_MUL', 'SATMUL'],
  parameters: [
      {
          name: 'Input',
          spread: true
      }
  ]
}
