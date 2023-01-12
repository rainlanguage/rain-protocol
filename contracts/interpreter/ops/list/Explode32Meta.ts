import { OpMeta } from "../types";

export const explode32Meta: OpMeta = {
    name: 'EXPLODE32',
    description: 'Part an uint256 value into 8 seperate 1 byte size values.',
    outputs: 8,
    inputs: 1,
    operand: 0,
    aliases: ['EXPLODE'],
    parameters: [
        {
            name: 'Value',
            spread: false
        }
    ]
}
