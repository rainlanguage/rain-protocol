import { ethers } from "hardhat";
import type { RightsManager } from '../typechain/RightsManager'
import type { CRPFactory } from '../typechain/CRPFactory'
import type { BFactory } from '../typechain/BFactory'
import chai from 'chai'

const { expect, assert } = chai

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

export const ONE = ethers.BigNumber.from('1' + eighteenZeros)

export const assertError = async (f:Function, s:string, e:string) => {
  let didError = false
  try {
      await f()
  } catch (e) {
      assert(e.toString().includes(s), `error string ${e} does not include ${s}`)
      didError = true
  }
  assert(didError, e)
}
