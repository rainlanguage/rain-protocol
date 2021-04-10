import type { HardhatUserConfig }  from "hardhat/types";
import "@nomiclabs/hardhat-waffle";
import "hardhat-typechain";
const config: HardhatUserConfig = {
  networks: {
    /*
    hardhat: {
      blockGasLimit: 100000000,
      allowUnlimitedContractSize: true,
    }
  }, */
  hardhat: {
      forking: {
        url: "https://eth-mainnet.alchemyapi.io/v2/0T6PEQIu3w1qwoPoPG3XPJHvKAzXEjkv",
        blockNumber: 12206000
      }
    }
  },
  solidity: {
    compilers: [{ version: "0.7.3", settings: {} }],
  },
};
export default config;
