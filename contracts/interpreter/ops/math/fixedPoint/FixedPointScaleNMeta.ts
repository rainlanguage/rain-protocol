import { OpMeta } from "../../types";

export const fixedPointScaleNMeta: OpMeta = {
    name: 'SCALEN',
    description: 'Rescale an 18 OOMs fixed point number to scale N.',
    outputs: 1,
    inputs: 1,
    operand: [
        {
            name: 'Target Decimals',
            description: 'the target decimals to scale to',
            bits: [0, 7],
            validRange: [[1, 255]]
        }
    ],
    aliases: ['SCALE_N'],
    parameters: [
        {
            name: 'Value',
            spread: false,
            description: 'The value to scale to N'
        }
    ]
}
