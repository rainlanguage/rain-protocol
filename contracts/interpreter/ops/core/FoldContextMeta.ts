import { OpMeta } from "../types";

export const foldContextMeta: OpMeta = {
  name: 'FOLD_CONTEXT',
  description: 'Performs a looped call over some inputs and some context rows specified by folding a column as start column index and width in operand arguments as length of items in rows',
  outputs: {
      startBit: 12,
      endBit: 15
  },
  inputs: {
      startBit: 12,
      endBit: 15
  },
  operand: [
      {
          name: 'Inputs',
          startBit: 12,
          endBit: 15,
          validRange: [[0, 15]]
      },
      {
          name: 'Width',
          description: 'number of columns to loop over',
          startBit: 8,
          endBit: 11,
          validRange: [[0, 15]]
      },
      {
          name: 'Fold Column',
          description: 'column to base the loop on',
          startBit: 4,
          endBit: 7,
          validRange: [[0, 15]]
      },
      {
          name: 'Source Index',
          description: 'index of the source to run',
          startBit: 0,
          endBit: 3,
          validRange: [[0, 15]]
      }
  ],
  aliases: ['FOLDCONTEXT', 'FOLD'],
  parameters: [
      {
          name: 'Input',
          spread: true
      }
  ]
}
