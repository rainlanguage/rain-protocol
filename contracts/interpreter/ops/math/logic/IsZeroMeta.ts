import { OpMeta } from "../../types";

export const isZeroMeta: OpMeta = {
  name: 'ISZERO',
  description: 'Checks if the value is zero and inserts true/1 into the stack if it is, else inserts false/0',
  outputs: 1,
  inputs: 1,
  operand: 0,
  aliases: ['IS_ZERO', 'FALSE', 'IS_FALSE', 'ISFALSE'],
  parameters: [
      {
          name: 'Value',
          spread: false
      },
  ]
}
