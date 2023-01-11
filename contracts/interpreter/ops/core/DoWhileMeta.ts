import { OpMeta } from "../types";

export const doWhileMeta: OpMeta = {
  name: 'DO_WHILE',
  description: 'Runs a while loop on number of items taken from a stack until a conditions is met',
  outputs: {
      startBit: 0,
      endBit: 3,
      computation: 'this + 1'
  },
  inputs: {
      startBit: 0,
      endBit: 3,
      computation: 'this + 1'
  },
  operand: [
      {
          name: 'Inputs',
          startBit: 0,
          endBit: 3,
          validRange: [[1, 15]],
          computation: 'this - 1'
      },
      {
          name: 'Source Index',
          description: 'index of the source to run',
          startBit: 8,
          endBit: 11,
          validRange: [[0, 15]]
      },
  ],
  aliases: ['WHILE', 'DOWHILE'],
  parameters: [
      {
          name: 'Input',
          spread: true
      },
      {
          name: 'Condition',
          spread: false,
          description: 'condition of while loop'
      }
  ]
}
