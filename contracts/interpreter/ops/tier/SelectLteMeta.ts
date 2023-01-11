import { OpMeta } from "../types";

export const selectLteMeta: OpMeta = {
  name: 'SELECT_LTE',
  description: 'Inserts the result of selecting the less than equal to specified value taken from stack among number of reports by a logic and mode into the stack',
  outputs: 1,
  inputs: {
      startBit: 0,
      endBit: 7
  },
  operand: [
      {
          name: 'Logic',
          description: 'select lte logic: every or any logic',
          startBit: 13,
          endBit: 13
      },
      {
          name: 'Mode',
          description: 'select lte mode: min, max or first',
          startBit: 8,
          endBit: 9,
          validRange: [[0, 2]]
      },
      {
          name: 'Inputs',
          startBit: 0,
          endBit: 7,
          validRange: [[2, 255]]
      }
  ],
  aliases: ['SELECTLTE', 'SELECT'],
  parameters: [
      {
          name: 'Referrence Timestamp',
          spread: false,
          description: 'The timestamp to check the tier reports against'
      },
      {
          name: 'Report',
          spread: true,
          description: 'The report to selectLte from'
      }
  ]
}
