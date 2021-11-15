import type { HardhatUserConfig } from "hardhat/types";
import "@nomiclabs/hardhat-waffle";
import "hardhat-typechain";
import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-ethers";

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      blockGasLimit: 100000000,
      allowUnlimitedContractSize: true,
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.5.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          },
          evmVersion: "byzantium",
        },
      },
      {
        version: "0.6.12",
        settings: {
          metadata: {
            useLiteralContent: true
          },
          optimizer: {
            enabled: true,
            runs: 100000,
          },
        },
      },
    ],
    overrides: {
      "contracts/test/ClaimERC1155Test.sol": {
        version: "0.6.12",
        settings: {
          metadata: {
            useLiteralContent: true
          },
          optimizer: {
            enabled: true,
            runs: 100000
          }
        }
      },
      "contracts/test/ConfigurableRightsPoolImports.sol": {
        version: "0.6.12",
        settings: {
          metadata: {
            useLiteralContent: true
          },
          optimizer: {
            enabled: true,
            runs: 100000
          }
        }
      },
      "contracts/test/PhasedScheduleTest.sol": {
        version: "0.6.12",
        settings: {
          metadata: {
            useLiteralContent: true
          },
          optimizer: {
            enabled: true,
            runs: 100000
          }
        }
      },
      "contracts/test/PhasedTest.sol": {
        version: "0.6.12",
        settings: {
          metadata: {
            useLiteralContent: true
          },
          optimizer: {
            enabled: true,
            runs: 100000
          }
        }
      },
      "contracts/test/RedeemableERC20Reentrant.sol": {
        version: "0.6.12",
        settings: {
          metadata: {
            useLiteralContent: true
          },
          optimizer: {
            enabled: true,
            runs: 100000
          }
        }
      },
      "contracts/test/ReserveToken.sol": {
        version: "0.6.12",
        settings: {
          metadata: {
            useLiteralContent: true
          },
          optimizer: {
            enabled: true,
            runs: 100000
          }
        }
      },
      "contracts/test/ReserveTokenTest.sol": {
        version: "0.6.12",
        settings: {
          metadata: {
            useLiteralContent: true
          },
          optimizer: {
            enabled: true,
            runs: 100000
          }
        }
      },
      "contracts/test/SeedERC20ForceSendEther.sol": {
        version: "0.6.12",
        settings: {
          metadata: {
            useLiteralContent: true
          },
          optimizer: {
            enabled: true,
            runs: 100000
          }
        }
      },
      "contracts/test/SeedERC20Reentrant.sol": {
        version: "0.6.12",
        settings: {
          metadata: {
            useLiteralContent: true
          },
          optimizer: {
            enabled: true,
            runs: 100000
          }
        }
      },
      "contracts/test/TierByConstructionClaimTest.sol": {
        version: "0.6.12",
        settings: {
          metadata: {
            useLiteralContent: true
          },
          optimizer: {
            enabled: true,
            runs: 100000
          }
        }
      },
      "contracts/test/TierByConstructionTest.sol": {
        version: "0.6.12",
        settings: {
          metadata: {
            useLiteralContent: true
          },
          optimizer: {
            enabled: true,
            runs: 100000
          }
        }
      },
      "contracts/test/TierUtilTest.sol": {
        version: "0.6.12",
        settings: {
          metadata: {
            useLiteralContent: true
          },
          optimizer: {
            enabled: true,
            runs: 100000
          }
        }
      },
      "contracts/test/TrustReentrant.sol": {
        version: "0.6.12",
        settings: {
          metadata: {
            useLiteralContent: true
          },
          optimizer: {
            enabled: true,
            runs: 100000
          }
        }
      },
      "contracts/test/ValueTierTest.sol": {
        version: "0.6.12",
        settings: {
          metadata: {
            useLiteralContent: true
          },
          optimizer: {
            enabled: true,
            runs: 100000
          }
        }
      }
    }
  },
};
export default config;
