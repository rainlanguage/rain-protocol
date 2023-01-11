import { OpMeta } from "../../types";

export const iSaleV2ReserveMeta: OpMeta = {
  name: 'ISALEV2_RESERVE',
  description: 'The reserve token address',
  outputs: 1,
  inputs: 1,
  operand: 0,
  aliases: ['RESERVE', 'RESERVE_TOKEN', 'RESERVETOKEN'],
  parameters: [
      {
          name: 'ISale Address',
          spread: false
      }
  ]
}