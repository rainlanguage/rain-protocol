import type { HardhatUserConfig }  from "hardhat/types";
import "@nomiclabs/hardhat-waffle";
import "hardhat-typechain";
import "hardhat-gas-reporter"

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
    compilers: [{ version: "0.6.12", settings: {
      optimizer:{
        enabled: true,
        runs: 100000
      }
    } }],
  },
};
export default config;
