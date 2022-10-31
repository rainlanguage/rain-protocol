import { StateConfigStruct } from "../../typechain/contracts/interpreter/run/StandardInterpreter";

export type FlowConfig = {
  stateConfig: StateConfigStruct;
  flows: StateConfigStruct[];
};

export type FlowERC20Config = {
  stateConfig: StateConfigStruct;
  flows: StateConfigStruct[];
  name: string;
  symbol: string;
};

export type FlowERC721Config = {
  stateConfig: StateConfigStruct;
  flows: StateConfigStruct[];
  name: string;
  symbol: string;
};

export type FlowERC1155Config = {
  stateConfig: StateConfigStruct;
  flows: StateConfigStruct[];
  uri: string;
};
