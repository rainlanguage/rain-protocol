import { OpMeta } from "../types";

export const erc20BalanceOfMeta: OpMeta = {
    name: 'ERC20_BALANCE_OF',
    description: 'Get the balance of an ERC20 token of an account and insert it into the stack',
    outputs: 1,
    inputs: 2,
    operand: 0,
    aliases: ['ERC20_BALANCE_OF', 'ERC20BALANCEOF', 'IERC20BALANCEOF'],
    parameters: [
        {
            name: 'Token Address',
            spread: false
        },
        {
            name: 'Account',
            spread: false
        }
    ]
}
