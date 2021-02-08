const hardhat = require("hardhat");

import * as Constants from '../src/store/Constants'

const deploy = async (name:string, libs:object) => {
    const factory = await hardhat.ethers.getContractFactory(name, {
        libraries: libs
    })
    const contract = await factory.deploy();

    await contract.deployed();

    return contract
}

async function main() {
  const aToken = await deploy("contracts/AToken.sol:AToken", {})
  const bToken = await deploy("contracts/BToken.sol:BToken", {})
  const reserveToken = await deploy("contracts/ReserveToken.sol:ReserveToken", {})
  const bFactory = await deploy("contracts/configurable-rights-pool/contracts/test/BFactory.sol:BFactory", {})

  const safeMath = await deploy("contracts/configurable-rights-pool/libraries/BalancerSafeMath.sol:BalancerSafeMath", {})
  const rightsManager = await deploy("contracts/configurable-rights-pool/libraries/RightsManager.sol:RightsManager", {})
  const smartPoolManager = await deploy("contracts/configurable-rights-pool/libraries/SmartPoolManager.sol:SmartPoolManager", {})
  const crpFactory = await deploy("contracts/configurable-rights-pool/contracts/CRPFactory.sol:CRPFactory", {
      BalancerSafeMath: Constants.safeMathAddress,
      RightsManager: '0x5fc8d32690cc91d4c39d9d3abcbd16989f875707',
      SmartPoolManager: '0x0165878a594ca255338adfa4d48449f69242eb8f',
  })
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });