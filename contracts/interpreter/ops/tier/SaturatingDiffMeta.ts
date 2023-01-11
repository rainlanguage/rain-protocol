import { OpMeta } from "../types";

export const saturatingDiffMeta: OpMeta = {
  name: 'SATURATING_DIFF',
  description: 'Inserts the saturating difference of 2 reports taken from the stack into the stack and prevents reverts if the result below zero',
  outputs: 1,
  inputs: 2,
  operand: 0,
  aliases: ['SAT_DIFF', 'SATDIFF', 'SATURATINGDIFF'],
  parameters: [
      {
          name: '1st Value',
          spread: false
      },
      {
          name: '2nd Value2',
          spread: false
      }
  ]
}
