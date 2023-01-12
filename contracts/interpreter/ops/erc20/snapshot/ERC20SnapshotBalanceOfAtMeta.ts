import { OpMeta } from "../../types";

export const erc20SnapshotBalanceOfatMeta: OpMeta = {
    name: 'ERC20_SNAPSHOT_BALANCE_OF_AT',
    description: 'Get the snapshot balance of an ERC20 token of an account and insters it into the stack',
    outputs: 1,
    inputs: 3,
    operand: 0,
    aliases: [
        'ERC20SNAPSHOTBALANCEOFAT',
        'IERC20SNAPSHOTBALANCEOFAT',
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
            name: 'Snapshot Id',
            spread: false
        }
    ]
}
