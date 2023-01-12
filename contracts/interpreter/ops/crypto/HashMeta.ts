import { OpMeta } from "../types";

export const hashMeta: OpMeta = {
    name: 'HASH',
    description: 'Hash (solidity keccak256) value taken from stack and stack the result',
    outputs: 1,
    inputs: {
        bits: [0, 7]
    },
    operand: [
        {
            name: 'Inputs',
            bits: [0, 7],
            validRange: [[1, 255]]
        }
    ],
    aliases: ['ENCODE', 'ENCRYPT'],
    parameters: [
        {
            name: 'Input',
            spread: true
        }
    ]
}
