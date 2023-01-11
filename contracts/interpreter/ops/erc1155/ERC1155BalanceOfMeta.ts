import { OpMeta } from "../types";

export const erc1155BalanceOfBatchMeta: OpMeta = {
  name: 'ERC1155_BALANCE_OF_BATCH',
  description: 'Get the balances of an ERC1155 token for batches of accounts and token ids and insert it into the stack',
  outputs: {
      startBit: 0,
      endBit: 7
  },
  inputs: {
      startBit: 0,
      endBit: 7,
      computation: '(this * 2) + 1'
  },
  operand: [
      {
          name: 'Inputs',
          startBit: 0,
          endBit: 7,
          validRange: [[3, 255]],
          computation: '(this - 1) / 2'
      }
  ],
  aliases: [
      'ERC1155BALANCEOFBATCH',
      'IERC1155BALANCEOFBATCH',
  ],
  parameters: [
      {
          name: 'Token Address',
          spread: false,
      },
      {
          name: 'Account',
          spread: true
      },
      {
          name: 'Token Id',
          spread: true
      }
  ]
}
