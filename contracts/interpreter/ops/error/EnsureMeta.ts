import { OpMeta } from "../types";

export const ensureMeta: OpMeta = {
  name: 'ENSURE',
  description: 'Require ietms(s) of the stack to be true, i.e. greater than zero, revert if not',
  outputs: 0,
  inputs: {
      startBit: 0,
      endBit: 7
  },
  operand: [
      {
          name: 'Inputs',
          startBit: 0,
          endBit: 7,
          validRange: [[1, 255]]
      }
  ],
  aliases: ['REQUIRE'],
  parameters: [
      {
          name: 'Input',
          spread: true
      }
  ]
}
