import { OpMeta } from "../types";

export const subMeta: OpMeta = {
    name: 'SUB',
    description: 'Inserts the subtraction of N values taken from the stack into the stack',
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
    aliases: ['MINUS', '-'],
    parameters: [
        {
            name: 'Input',
            spread: true
        }
    ]
}
