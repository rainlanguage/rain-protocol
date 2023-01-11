/**
 * @public
 * 
 */
export type DerivedIO = {
    startBit: number;
    endBit: number;
    computation?: string;
}

/**
 * @public
 * 
 */
export type OpIO = number | string | DerivedIO

/**
 * @public
 * 
 */
export type DerivedOperandArg = DerivedIO & {
    name: string;
    description?: string;
    validRange?: number[][];
}

/**
 * @public
 * 
 */
export type OperandMeta = number | DerivedOperandArg[]

/**
 * @public
 * 
 */
export type ParameterMeta = {
    name: string;
    spread: boolean;
    description?: string;
}

/**
 * @public
 */
export type OpMeta = {
    name: string;
    description: string;
    outputs: OpIO;
    inputs: OpIO;
    operand: OperandMeta;
    parameters?: ParameterMeta[];
    aliases?: string[];
}
