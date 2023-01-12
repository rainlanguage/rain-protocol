import { OpMeta } from "../types";

export const timestampMeta: OpMeta = {
    name: 'BLOCK_TIMESTAMP',
    description: 'Insert the current block timestamp into the stack',
    outputs: 1,
    inputs: 0,
    operand: 0,
    aliases: [
        'NOW',
        'BLOCKTIMESTAMP',
        'CURRENTTIME',
        'CURRENT_TIME',
    ]
}
