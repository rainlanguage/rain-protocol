import { OpMeta } from "../types";

export const erc1155BalanceOfBatchMeta: OpMeta = {
    name: 'ERC1155_BALANCE_OF_BATCH',
    description: 'Get the balances of an ERC1155 token for batches of accounts and token ids and insert it into the stack',
    outputs: {
        bits: [0, 7]
    },
    inputs: {
        bits: [0, 7],
        computation: '(this * 2) + 1'
    },
    operand: [
        {
            name: 'Inputs',
            bits: [0, 7],
            validRange: [[3, 255]],
            computation: '(this - 1) / 2'
        }
    ],
    aliases: [
        'ERC1155BALANCEOFBATCH',
        'IERC1155BALANCEOFBATCH',
    ],
    parameters: [
        {
            name: 'Token Address',
            spread: false,
        },
        {
            name: 'Account',
            spread: true
        },
        {
            name: 'Token Id',
            spread: true
        }
    ]
}
