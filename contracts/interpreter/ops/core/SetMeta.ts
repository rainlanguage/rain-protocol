import { OpMeta } from "../types";

export const setMeta: OpMeta = {
  name: 'SET',
  description: 'Write a key/value pair taken from stack and write into contract storage',
  outputs: 0,
  inputs: 2,
  operand: 0,
  aliases: ['WRITE'],
  parameters: [
      {
          name: 'Key',
          spread: false
      },
      {
          name: 'Value',
          spread: false
      }
  ]
}
