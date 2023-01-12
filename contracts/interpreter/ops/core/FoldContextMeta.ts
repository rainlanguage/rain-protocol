import { OpMeta } from "../types";

export const foldContextMeta: OpMeta = {
    name: 'FOLD_CONTEXT',
    description: 'Performs a looped call over some inputs and some context rows specified by folding a column as start column index and width in operand arguments as length of items in rows',
    outputs: {
        bits: [12, 15],
    },
    inputs: {
        bits: [12, 15],
    },
    operand: [
        {
            name: 'Inputs',
            bits: [12, 15],
            validRange: [[0, 15]]
        },
        {
            name: 'Width',
            description: 'number of columns to loop over',
            bits: [8, 11],
            validRange: [[0, 15]]
        },
        {
            name: 'Fold Column',
            description: 'column to base the loop on',
            bits: [4, 7],
            validRange: [[0, 15]]
        },
        {
            name: 'Source Index',
            description: 'index of the source to run',
            bits: [0, 3],
            validRange: [[0, 15]]
        }
    ],
    aliases: ['FOLDCONTEXT', 'FOLD'],
    parameters: [
        {
            name: 'Input',
            spread: true
        }
    ]
}
