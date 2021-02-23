import { ethers } from "hardhat";
import type { RightsManager } from '../typechain/RightsManager'
import type { CRPFactory } from '../typechain/CRPFactory'
import type { BFactory } from '../typechain/BFactory'

export const basicDeploy = async (name, libs) => {
    const factory = await ethers.getContractFactory(
      name,
      {
        libraries: libs
      },
    )

    const contract = (await factory.deploy())

    await contract.deployed()

    return contract
}

export const balancerDeploy = async () => {
  const rightsManager = (await basicDeploy('RightsManager', {})) as RightsManager
  const balancerSafeMath = (await basicDeploy('BalancerSafeMath', {}))
  const smartPoolManager = (await basicDeploy('SmartPoolManager', {}))
  const crpFactory = (await basicDeploy('CRPFactory', {
      'RightsManager': rightsManager.address,
      'BalancerSafeMath': balancerSafeMath.address,
      'SmartPoolManager': smartPoolManager.address,
  })) as CRPFactory
  const bFactory = (await basicDeploy('BFactory', {})) as BFactory

  return [rightsManager, crpFactory, bFactory]
}

export const eighteenZeros = '000000000000000000'