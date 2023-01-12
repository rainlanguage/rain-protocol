import { OpMeta } from "../../types";

export const iVerifyV1AccountStatusAtTimeMeta: OpMeta = {
    name: 'IVERFYV1_ACCOUNT_STATUS_AT_TIME',
    description: 'Read and put the status of an account from the verify v1 contract into the stack',
    outputs: 1,
    inputs: 2,
    operand: 0,
    aliases: ['VERIFY_STATUS', 'VERIFYSTATUS'],
    parameters: [
        {
            name: 'ISale Address',
            spread: false
        }
    ]
}
