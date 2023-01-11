import { OpMeta } from "../types";

export const contextMeta: OpMeta = {
  name: 'CONTEXT',
  description: 'Inserts an context cell into the stack by reading column and row from operand',
  outputs: 1,
  inputs: 0,
  operand: [
      {
          name: 'Column',
          description: 'context column',
          startBit: 0,
          endBit: 7,
          validRange: [[0, 255]]
      },
      {
          name: 'Row',
          description: 'context row',
          startBit: 8,
          endBit: 15,
          validRange: [[0, 255]]
      }
  ]
}
