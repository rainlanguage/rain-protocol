import { OpMeta } from "../types";

export const getMeta: OpMeta = {
  name: 'GET',
  description: 'Read a key/value pair from contract storage by providing the key and stack the value',
  outputs: 1,
  inputs: 1,
  operand: 0,
  parameters: [
      {
          name: 'Key',
          spread: false,
          description: 'the key of the key/value pair'
      }
  ]
}
