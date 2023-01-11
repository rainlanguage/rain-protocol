import { OpMeta } from "../types";

export const erc721OwnerOfMeta: OpMeta = {
  name: 'ERC721_OWNER_OF',
  description: 'Get the owner of an ERC20 token of an account and insert it into the stack',
  outputs: 1,
  inputs: 2,
  operand: 0,
  aliases: ['ERC721OWNEROF', 'IERC721OWNEROF'],
  parameters: [
      {
          name: 'Token Address',
          spread: false
      },
      {
          name: 'Token Id',
          spread: false
      }
  ]
}
