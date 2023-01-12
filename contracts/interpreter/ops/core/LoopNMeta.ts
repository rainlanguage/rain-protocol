import { OpMeta } from "../types";

export const loopNMeta: OpMeta = {
    name: 'LOOP_N',
    description: 'Loop a source n times by taking some items from stack and putting the results back into stack',
    outputs: {
        bits: [4, 7]
    },
    inputs: {
        bits: [0, 3]
    },
    operand: [
        {
            name: 'Loop Size',
            description: 'number of loops',
            bits: [12, 15],
            validRange: [[0, 15]]
        },
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
    aliases: ['LOOP', 'LOOPN', 'FOR'],
    parameters: [
        {
            name: 'Input',
            spread: true
        }
    ]
}
