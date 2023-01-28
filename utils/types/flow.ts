import { ExpressionConfigStruct } from "../../typechain/contracts/interpreter/run/StandardInterpreter";

export type FlowConfig = {
  expressionConfig: ExpressionConfigStruct;
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
