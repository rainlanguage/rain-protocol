import { OpMeta } from "../types";

export const erc1155BalanceOfMeta: OpMeta = {
    name: 'ERC1155_BALANCE_OF',
    description: 'Get the balance of an ERC1155 token of an account and insert it into the stack',
    outputs: 1,
    inputs: 3,
    operand: 0,
    aliases: [
        'ERC1155BALANCEOF',
        'IERC1155BALANCEOF',
    ],
    parameters: [
        {
            name: 'Token Address',
            spread: false
        },
        {
            name: 'Account',
            spread: false
        },
        {
            name: 'Token Id',
            spread: false
        }
    ]
}
