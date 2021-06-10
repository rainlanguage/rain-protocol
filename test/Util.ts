import { ethers } from "hardhat";
import type { RightsManager } from '../typechain/RightsManager'
import type { CRPFactory } from '../typechain/CRPFactory'
import type { BFactory } from '../typechain/BFactory'
import type { SeedERC20Factory } from '../typechain/SeedERC20Factory'
import type { RedeemableERC20Factory } from '../typechain/RedeemableERC20Factory'
import type { RedeemableERC20PoolFactory } from '../typechain/RedeemableERC20PoolFactory'
import type { TrustFactory } from '../typechain/TrustFactory'
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

export const factoryDeploy = async (rightsManager, crpFactory, bFactory) => {
  const seedERC20Factory = (await basicDeploy('SeedERC20Factory', {})) as SeedERC20Factory
  const redeemableERC20Factory = (await basicDeploy('RedeemableERC20Factory', {})) as RedeemableERC20Factory
  const redeemableERC20PoolFactory = (await basicDeploy('RedeemableERC20PoolFactory', {
    'RightsManager': rightsManager.address
  })) as RedeemableERC20PoolFactory
  const trustFactoryFactory = await ethers.getContractFactory(
    'TrustFactory'
  )
  const trustFactory = await trustFactoryFactory.deploy({
    seedERC20Factory: seedERC20Factory.address,
    redeemableERC20Factory: redeemableERC20Factory.address,
    redeemableERC20PoolFactory: redeemableERC20PoolFactory.address,
    crpFactory: crpFactory.address,
    balancerFactory: bFactory.address,
  })
  await trustFactory.deployed()
  return [seedERC20Factory, redeemableERC20Factory, redeemableERC20PoolFactory, trustFactory]
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

export const assertError = async (f:Function, s:string, e:string) => {
  let didError = false
  try {
      await f()
  } catch (e) {
      assert(e.toString().includes(s), `error string ${e} does not include ${s}`)
      didError = true
  }
  assert(didError, `failed to error: ${e}`)
}