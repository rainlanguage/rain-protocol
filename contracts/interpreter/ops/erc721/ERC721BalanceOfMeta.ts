import { OpMeta } from "../types";

export const erc721BalanceOfMeta: OpMeta = {
  name: 'ERC721_BALANCE_OF',
  description: 'Get the balance of an ERC721 token of an account and insert it into the stack',
  outputs: 1,
  inputs: 2,
  operand: 0,
  aliases: [
      'ERC721BALANCEOF',
      'IERC721BALANCEOF',
  ],
  parameters: [
      {
          name: 'Token Address',
          spread: false
      },
      {
          name: 'Account',
          spread: false
      }
  ]
}
