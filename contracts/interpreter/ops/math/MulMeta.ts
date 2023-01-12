import { OpMeta } from "../types";

export const mulMeta: OpMeta = {
    name: 'MUL',
    description: 'Inserts the multiplication of N values taken from the stack into the stack',
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
    aliases: ['*', 'X'],
    parameters: [
        {
            name: 'Input',
            spread: true
        }
    ]
}
