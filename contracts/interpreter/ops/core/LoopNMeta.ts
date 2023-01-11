import { OpMeta } from "../types";

export const loopNMeta: OpMeta = {
  name: 'LOOP_N',
  description: 'Loop a source n times by taking some items from stack and putting the results back into stack',
  outputs: {
      startBit: 4,
      endBit: 7
  },
  inputs: {
      startBit: 0,
      endBit: 3
  },
  operand: [
      {
          name: 'Loop Size',
          description: 'number of loops',
          startBit: 12,
          endBit: 15,
          validRange: [[0, 15]]
      },
      {
          name: 'Inputs',
          startBit: 0,
          endBit: 3,
          validRange: [[0, 15]]
      },
      {
          name: 'Output Size',
          description: 'number of outputs',
          startBit: 4,
          endBit: 7,
          validRange: [[0, 15]]
      },
      {
          name: 'Source Index',
          description: 'index of the source to run',
          startBit: 8,
          endBit: 11,
          validRange: [[0, 15]]
      }
  ],
  aliases: ['LOOP', 'LOOPN', 'FOR'],
  parameters: [
      {
          name: 'Input',
          spread: true
      }
  ]
}
