import { OpMeta } from "../../types";

export const iSaleV2TokenMeta: OpMeta = {
  name: 'ISALEV2_TOKEN',
  description: 'The rTKN address',
  outputs: 1,
  inputs: 1,
  operand: 0,
  aliases: ['RTKN', 'TOKEN', 'REDEEMABLE_TOKEN'],
  parameters: [
      {
          name: 'ISale Address',
          spread: false
      }
  ]
}
