import { OpMeta } from "../types";

export const readMemoryMeta: OpMeta = {
  name: 'READ_MEMORY',
  description: 'Takes an item from constants array or from stack items and insert it into the stack',
  outputs: 1,
  inputs: 0,
  operand: [
      {
          name: 'Type',
          description: 'type of the read, from constants or stack',
          startBit: 0,
          endBit: 0
      },
      {
          name: 'Index',
          description: 'index of the item to read',
          startBit: 1,
          endBit: 15,
          validRange: [[0, 127]],
      }
  ],
  aliases: ['READ']
}
