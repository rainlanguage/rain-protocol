import { OpMeta } from "../types";

export const addMeta: OpMeta = {
    name: 'ADD',
    description: 'Inserts the result of sum of N values taken from the stack into the stack',
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
    aliases: ['+', 'SUM'],
    parameters: [
        {
            name: 'Input',
            spread: true
        }
    ]
}
