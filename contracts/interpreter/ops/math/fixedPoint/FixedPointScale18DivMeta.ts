import { OpMeta } from "../../types";

export const fixedPointScale18DivMeta: OpMeta = {
    name: 'SCALE18_DIV',
    description: 'Inserts the result of dividing the 2 items of the stack by keeping the 18 fixed point decimals into the stack',
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
    aliases: ['SCALE18DIV', 'SCALE_18_DIV'],
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
