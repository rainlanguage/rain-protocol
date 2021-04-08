import type { HardhatUserConfig }  from "hardhat/types";
import "@nomiclabs/hardhat-waffle";
import "hardhat-typechain";
const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      blockGasLimit: 100000000,
      allowUnlimitedContractSize: true,
    }
  },
  solidity: {
    compilers: [{ version: "0.7.3", settings: {} }],
  },
};
export default config;
