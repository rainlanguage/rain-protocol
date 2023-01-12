import { OpMeta } from "../types";

export const modMeta: OpMeta = {
    name: 'MOD',
    description: 'Inserts the mod of N values taken from the stack into the stack',
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
    aliases: ['%'],
    parameters: [
        {
            name: 'Input',
            spread: true
        }
    ]
}
