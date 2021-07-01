import type { HardhatUserConfig }  from "hardhat/types";
import "@nomiclabs/hardhat-waffle";
import "hardhat-typechain";
import "hardhat-gas-reporter"

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      blockGasLimit: 100000000,
      allowUnlimitedContractSize: true,
    }
  },
  solidity: {
    compilers: [
      { version: "0.6.12", settings: {
        optimizer: {
          enabled: true
        }
      } },
    ],
  },
};
export default config;
