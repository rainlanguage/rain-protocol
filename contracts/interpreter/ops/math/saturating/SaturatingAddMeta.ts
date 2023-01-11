import { OpMeta } from "../../types";

export const saturatingAddMeta: OpMeta = {
  name: 'SATURATING_ADD',
  description: 'Inserts sum of the specified items from the stack and if prevernts reverts if the result goes above max 256 bit size',
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
      'SATURATINGADD',
      'SAT_ADD',
      'SATADD',
      'SATURATING_SUM',
      'SATURATINGSUM',
      'SATSUM',
      'SAT_SUM',
  ],
  parameters: [
      {
          name: 'Input',
          spread: true
      }
  ]
}