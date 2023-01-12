import { OpMeta } from "../../types";

export const eagerIfMeta: OpMeta = {
    name: 'EAGER_IF',
    description: 'Takes 3 items from the stack and check if the first item is non-zero the inserts the second item into the stack, else inserts the 3rd item',
    outputs: 1,
    inputs: 3,
    operand: 0,
    aliases: ['EAGERIF', 'IF'],
    parameters: [
        {
            name: 'Condition',
            spread: false,
            description: 'The condition to evaluate'
        },
        {
            name: 'Pass Statement',
            spread: false,
            description: 'The value to stack if the condition is non-zero/true'
        },
        {
            name: 'Fail Statement',
            spread: false,
            description: 'The value to stack if the condition is zero/false'
        }
    ]
}
