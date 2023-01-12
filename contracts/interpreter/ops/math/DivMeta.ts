import { OpMeta } from "../types";

export const divMeta: OpMeta = {
    name: 'DIV',
    description: 'Inserts the result of divide of N values taken from the stack into the stack',
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
    aliases: ['/', '÷', 'DIVIDE'],
    parameters: [
        {
            name: 'Input',
            spread: true
        }
    ]
}
