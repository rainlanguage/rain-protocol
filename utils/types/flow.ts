import { ExpressionConfigStruct } from "../../typechain/contracts/flow/basic/Flow";

export type FlowConfig = {
  flows: ExpressionConfigStruct[];
};

export type FlowERC20Config = {
  expressionConfig: ExpressionConfigStruct;
  flows: ExpressionConfigStruct[];
  name: string;
  symbol: string;
};

export type FlowERC721Config = {
  expressionConfig: ExpressionConfigStruct;
  flows: ExpressionConfigStruct[];
  name: string;
  symbol: string;
};

export type FlowERC1155Config = {
  expressionConfig: ExpressionConfigStruct;
  flows: ExpressionConfigStruct[];
  uri: string;
};
