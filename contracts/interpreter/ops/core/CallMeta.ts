import { OpMeta } from "../types";

export const callMeta: OpMeta = {
  name: 'CALL',
  description: 'Takes some items from the stack and runs a source with sub-stack and puts the results back to the stack',
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
  aliases: ['FUNCTION', 'FN'],
  parameters: [
      {
          name: 'Input',
          spread: true
      }
  ]
}