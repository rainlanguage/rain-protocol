import { OpMeta } from "../types";

export const selectLteMeta: OpMeta = {
    name: 'SELECT_LTE',
    description: 'Inserts the result of selecting the less than equal to specified value taken from stack among number of reports by a logic and mode into the stack',
    outputs: 1,
    inputs: {
        bits: [0, 7]
    },
    operand: [
        {
            name: 'Logic',
            description: 'select lte logic: every or any logic',
            bits: [13, 13],
        },
        {
            name: 'Mode',
            description: 'select lte mode: min, max or first',
            bits: [8, 9],
            validRange: [[0, 2]]
        },
        {
            name: 'Inputs',
            bits: [0, 7],
            validRange: [[2, 255]]
        }
    ],
    aliases: ['SELECTLTE', 'SELECT'],
    parameters: [
        {
            name: 'Referrence Timestamp',
            spread: false,
            description: 'The timestamp to check the tier reports against'
        },
        {
            name: 'Report',
            spread: true,
            description: 'The report to selectLte from'
        }
    ]
}
