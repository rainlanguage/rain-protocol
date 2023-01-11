import { OpMeta } from "../../types";

export const iSaleV2SaleStatusMeta: OpMeta = {
  name: 'ISALEV2_SALE_STATUS',
  description: 'Insert the status of a Sale contract into the stack by taking its address from the stack',
  outputs: 1,
  inputs: 1,
  operand: 0,
  aliases: ['SALE_STATUS', 'SALESTATUS'],
  parameters: [
      {
          name: 'ISale Address',
          spread: false
      }
  ]
}
