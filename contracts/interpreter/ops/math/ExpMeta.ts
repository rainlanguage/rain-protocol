import { OpMeta } from "../types";

export const expMeta: OpMeta = {
    name: 'EXP',
    description: 'Inserts the result of exponention of N values taken from the stack into the stack',
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
    aliases: [
        '^',
        'POW',
        'POWER',
        'EXPONENTION',
    ],
    parameters: [
        {
            name: 'Input',
            spread: true
        }
    ]
}
