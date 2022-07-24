import type { BoundsStruct } from "../../typechain/VMStateBuilder";

export const newVMStateBuilderBounds = (): BoundsStruct => {
  return {
    entrypoint: 0,
    minFinalStackIndex: 0,
    stackIndex: 0,
    stackLength: 0,
    storageLength: 0,
    contextLength: 0,
  };
};
