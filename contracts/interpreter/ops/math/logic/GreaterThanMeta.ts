import { OpMeta } from "../../types";

export const greaterThanMeta: OpMeta = {
  name: 'GREATER_THAN',
  description: 'Takes last 2 values from stack and puts true/1 into the stack if the first value is greater than the second value and false/0 if not.',
  outputs: 1,
  inputs: 2,
  operand: 0,
  aliases: ['GT', 'GREATERTHAN', 'BIGGERTHAN', 'BIGGER_THAN', '>'],
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
