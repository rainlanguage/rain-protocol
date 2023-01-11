import { OpMeta } from "../types";

export const erc20TotalSupplyMeta: OpMeta = {
  name: 'ERC20_TOTAL_SUPPLY',
  description: 'Get the supply of an ERC20 token and insert it into the stack',
  outputs: 1,
  inputs: 1,
  operand: 0,
  aliases: [
      'ERC20TOTALSUPPLY',
      'IERC20TOTALSUPPLY',
  ],
  parameters: [
      {
          name: 'Token Address',
          spread: false
      }
  ]
}
