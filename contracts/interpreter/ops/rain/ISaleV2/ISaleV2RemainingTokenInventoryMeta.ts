import { OpMeta } from "../../types";

export const iSaleV2RemainingTokenInventoryMeta: OpMeta = {
    name: 'ISALEV2_REMAINING_TOKEN_INVENTORY',
    description: 'The remaining rTKNs left to to be sold',
    outputs: 1,
    inputs: 1,
    operand: 0,
    aliases: ['REMAINING_UNITS'],
    parameters: [
        {
            name: 'ISale Address',
            spread: false
        }
    ]
}

