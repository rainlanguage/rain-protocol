import { OpMeta } from "../types";

export const minMeta: OpMeta = {
    name: 'MIN',
    description: 'Inserts the minimum of N values taken from the stack into the stack',
    outputs: 1,
    inputs: {
        bits: [0, 7]
    },
    operand: [
        {
            name: 'Inputs',
            bits: [0, 7],
            validRange: [[2, 255]]
        }
    ],
    aliases: ['MINIMUM', 'MIN_OF', 'MINOF'],
    parameters: [
        {
            name: 'Input',
            spread: true
        }
    ]
}
