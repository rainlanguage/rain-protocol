import { OpMeta } from "../../types";

export const iSaleV2TotalReserveReceivedMeta: OpMeta = {
    name: 'ISALEV2_TOTAL_RESERVE_RECEIVED',
    description: 'The total amount of reserve tokens received by the sale',
    outputs: 1,
    inputs: 1,
    operand: 0,
    aliases: ['TOTAL_RAISED'],
    parameters: [
        {
            name: 'ISale Address',
            spread: false
        }
    ]
}
