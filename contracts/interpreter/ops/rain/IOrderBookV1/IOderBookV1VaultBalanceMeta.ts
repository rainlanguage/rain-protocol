import { OpMeta } from "../../types";

export const iOrderBookV1VaultBalanceMeta: OpMeta = {
  name: 'IORDERBOOKV1_VAULT_BALANCE',
  description: 'The balance of an orderbook vault',
  outputs: 1,
  inputs: 4,
  operand: 0,
  aliases: ['VAULTBALANCE', 'VAULT_BALANCE'],
  parameters: [
      {
          name: 'Orderbook Address',
          spread: false,
          description: 'The address of the IOrderbookV2'
      },
      {
          name: 'Owner Address',
          spread: false,
          description: 'The address of the Owner of the vault'
      },
      {
          name: 'Token Address',
          spread: false,
          description: 'The address of the Token'
      },
      {
          name: 'Vault ID',
          spread: false
      }
  ]
}