import { OpMeta } from "../../types";

export const fixedPointScaleByMeta: OpMeta = {
    name: 'SCALE_BY',
    description: 'Scale a fixed point up or down by opernad.',
    outputs: 1,
    inputs: 1,
    operand: [
        {
            name: 'Scale',
            description: 'determines the up/down scale as 2s complement',
            bits: [0, 7]
        }
    ],
    aliases: ['SCALEBY'],
    parameters: [
        {
            name: 'Value',
            spread: false,
            description: 'The value to scale by'
        }
    ]
}
