export type FlowConfig = {
  flows: Array<any>;
};

export type FlowERC20Config = {
  expressionConfig: any;
  flows: Array<any>;
  name: string;
  symbol: string;
};

export type FlowERC721Config = {
  expressionConfig: any;
  flows: Array<any>;
  name: string;
  symbol: string;
  baseURI: string;
};

export type FlowERC1155Config = {
  expressionConfig: any;
  flows: Array<any>;
  uri: string;
};
