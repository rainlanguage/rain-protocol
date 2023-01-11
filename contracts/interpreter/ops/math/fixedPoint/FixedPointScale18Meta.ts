import { OpMeta } from "../../types";

export const fixedPointScale18Meta: OpMeta = {
  name: 'SCALE18',
  description: 'Rescale some fixed point number to 18 OOMs in situ.',
  outputs: 1,
  inputs: 1,
  operand: [
      {
          name: 'Decimals',
          description: 'decimals of the value to scale to 18',
          startBit: 0,
          endBit: 7,
          validRange: [[1, 255]]
      }
  ],
  aliases: ['SCALE_18'],
  parameters: [
      {
          name: 'Value',
          spread: false
      }
  ]
}
