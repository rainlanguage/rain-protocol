import type { HardhatUserConfig }  from "hardhat/types";
import "@nomiclabs/hardhat-waffle";
import "hardhat-typechain";
import {removeConsoleLog} from 'hardhat-preprocessor';
import "hardhat-contract-sizer"

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      blockGasLimit: 100000000,
      allowUnlimitedContractSize: true,
    }
  },
  preprocess: {
    eachLine: removeConsoleLog((hre) => hre.network.name !== 'hardhat' && hre.network.name !== 'localhost'),
  },
  solidity: {
    compilers: [
      { version: "0.6.12", settings: {} },
      { version: "0.7.3", settings: {} }
    ],
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      }
    }
  },
};
export default config;
