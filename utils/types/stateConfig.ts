import { BigNumberish, BytesLike } from "ethers";

export type StateConfig = {
  sources: BytesLike[];
  constants: BigNumberish[];
};
