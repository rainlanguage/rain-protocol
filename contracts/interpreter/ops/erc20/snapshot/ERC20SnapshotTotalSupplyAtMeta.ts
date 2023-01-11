import { OpMeta } from "../../types";

export const erc20SnapshotTotalSupplyAtMeta: OpMeta = {
  name: 'ERC20_SNAPSHOT_TOTAL_SUPPLY_AT',
  description: 'Get the snapshot supply of an ERC20 token and insert it into the stack',
  outputs: 1,
  inputs: 2,
  operand: 0,
  aliases: [
      'ERC20SNAPSHOTTOTALSUPPLYAT',
      'IERC20SNAPSHOTTOTALSUPPLYAT',
  ],
  parameters: [
      {
          name: 'Token Address',
          spread: false
      },
      {
          name: 'Snapshot Id',
          spread: false
      }
  ]
}