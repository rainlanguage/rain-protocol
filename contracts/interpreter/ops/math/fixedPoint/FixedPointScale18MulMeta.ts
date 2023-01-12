import { OpMeta } from "../../types";

export const fixedPointScale18MulMeta: OpMeta = {
    name: 'SCALE18_MUL',
    description: 'Inserts the result of multiplying the 2 items of the stack by keeping the 18 fixed point decimals into the stack',
    outputs: 1,
    inputs: 2,
    operand: [
        {
            name: 'Decimals',
            description: 'decimals of the first value',
            bits: [0, 7],
            validRange: [[1, 255]]
        }
    ],
    aliases: ['SCALE18MUL', 'SCALE_18_MUL'],
    parameters: [
        {
            name: '1st Value',
            spread: false,
            description: 'The first value'
        },
        {
            name: '2nd Value',
            spread: false,
            description: 'The second value'
        }
    ]
}
