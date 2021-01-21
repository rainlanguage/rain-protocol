const HDWalletProvider = require('@truffle/hdwallet-provider')

const infuraUrl = (network, projectId) => `https://${network}.infura.io/v3/${projectId}`

// https://forum.openzeppelin.com/t/connecting-to-public-test-networks-with-truffle/2960
module.exports = {

  compilers: {
    solc: {
      version: "^0.6.0"
    }
  },

  networks: {
    development: {
      host: "127.0.0.1",
      port: 8545,
      network_id: "*",
    },
    ropsten: {
      provider: () => new HDWalletProvider(process.env.MNEMONIC, infuraUrl('ropsten', process.env.INFURA_PROJECT_ID)),
      network_id: 3,
      gas: 5500000,
      confirmations: 2,
      timeoutBlocks: 200,
    },
    goerli: {
      provider: () => new HDWalletProvider(process.env.MNEMONIC, infuraUrl('goerli', process.env.INFURA_PROJECT_ID)),
      network_id: 5,
      gas: 5500000,
      confirmations: 2,
      timeoutBlocks: 200,
    }
  }

}
