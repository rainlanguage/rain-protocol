import { OpMeta } from "../types";

export const callMeta: OpMeta = {
    name: 'CALL',
    description: 'Takes some items from the stack and runs a source with sub-stack and puts the results back to the stack',
    outputs: {
        bits: [4, 7]
    },
    inputs: {
        bits: [0, 3]
    },
    operand: [
        {
            name: 'Inputs',
            bits: [0, 3],
            validRange: [[0, 15]]
        },
        {
            name: 'Output Size',
            description: 'number of outputs',
            bits: [4, 7],
            validRange: [[0, 15]]
        },
        {
            name: 'Source Index',
            description: 'index of the source to run',
            bits: [8, 11],
            validRange: [[0, 15]]
        }
    ],
    aliases: ['FUNCTION', 'FN'],
    parameters: [
        {
            name: 'Input',
            spread: true
        }
    ]
}