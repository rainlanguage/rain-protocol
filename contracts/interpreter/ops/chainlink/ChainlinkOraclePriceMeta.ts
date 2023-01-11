import { OpMeta } from "../types";

export const chainlinkOraclePriceMeta: OpMeta = {
  name: 'CHAINLIN_PRICE',
  description: 'Takes 2 items from constants array and calls the Chainlink Oracle to get price and stack it',
  outputs: 1,
  inputs: 2,
  operand: 0,
  aliases: ['CHAINLINKPRICE', 'PRICE'],
  parameters: [
      {
          name: 'Feed',
          spread: false,
          description: 'address of the price feed'
      },
      {
          name: 'Stale After',
          spread: false,
          description: 'amount of time that price will be valid'
      }
  ]
}