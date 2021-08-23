import chai from 'chai'
import { ethers } from "hardhat";

const { expect, assert } = chai

export const basicDeploy = async (name: any, libs: any) => {
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

export const assertError = async (f: Function, s: string, e: string) => {
  let didError = false
  try {
    await f()
  } catch (e) {
    assert(e.toString().includes(s), `error string ${e} does not include ${s}`)
    didError = true
  }
  assert(didError, e)
}

export const eighteenZeros = '000000000000000000'