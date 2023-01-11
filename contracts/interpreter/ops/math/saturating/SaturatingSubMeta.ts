import { OpMeta } from "../../types";

export const saturatingSubMeta: OpMeta = {
  name: 'SATURATING_SUB',
  description: 'Inserts subtraction of the specified items from the stack and if prevernts reverts if the result goes blow zero',
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
      'SATURATINGSUB',
      'SAT_SUB',
      'SATSUB',
      'SATURATING_MINUS',
      'SATURATINGMINUS',
      'SATMINUS',
      'SAT_MINUS',
  ],
  parameters: [
      {
          name: 'Input',
          spread: true
      }
  ]
}
