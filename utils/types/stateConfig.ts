import { BigNumberish, BytesLike } from "ethers";

export type ExpressionConfig = {
  sources: BytesLike[];
  constants: BigNumberish[];
};
