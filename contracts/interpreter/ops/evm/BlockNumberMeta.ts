import { OpMeta } from "../types";

export const blockNumberMeta: OpMeta = {
  name: 'BLOCK_NUMBER',
  description: 'Inserts the current block number into the stack',
  outputs: 1,
  inputs: 0,
  operand: 0,
  aliases: ['CURRENT_BLOCK', 'CURRENTBLOCK', 'BLOCKNUMBER']
}
