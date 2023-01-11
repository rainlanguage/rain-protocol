import { OpMeta } from "../types";

export const contextRowMeta: OpMeta = {
  name: 'CONTEXT_ROW',
  description: 'Inserts a context cell into the stack by reading the column from operand and row from stack',
  outputs: 1,
  inputs: 1,
  operand: [
      {
          name: 'Column',
          description: 'context column',
          startBit: 0,
          endBit: 7,
          validRange: [[0, 255]]
      }
  ]
}
