import { OpMeta } from "../types";

export const iTierV2ReportMeta: OpMeta = {
    name: 'ITIERV2_REPORT',
    description: 'Inserts the report of an account of a tier contract and optionally contexts which are taken from the stack into the stack',
    outputs: 1,
    inputs: {
        bits: [0, 7]
    },
    operand: [
        {
            name: 'Inputs',
            bits: [0, 7],
            validRange: [[2], [3], [10]],
            computation: 'this - 2'
        }
    ],
    aliases: [
        'REPORT',
        'ITIERV2REPORT',
        'TIERREPORT',
        'TIER_REPORT',
        'ITIERREPORT',
        'ITIER_REPORT',
    ],
    parameters: [
        {
            name: 'ITierV2 Address',
            spread: false
        },
        {
            name: 'Account',
            spread: false
        },
        {
            name: 'Context',
            spread: true,
            description: 'The contextual values'
        }
    ]
}
