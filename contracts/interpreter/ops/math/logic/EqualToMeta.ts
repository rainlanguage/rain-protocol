import { OpMeta } from "../../types";

export const equalToMeta: OpMeta = {
  name: 'EQUAL_TO',
  description: 'Comapres the last 2 items of the stack together and inserts true/1 into stack if they are euqal, else inserts false/0',
  outputs: 1,
  inputs: 2,
  operand: 0,
  aliases: ['EQ', 'EQUALTO', '=='],
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
