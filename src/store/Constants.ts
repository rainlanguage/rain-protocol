export const base = 'contracts'
export const balancerBase = `${base}/configurable-rights-pool/contracts/test`
export const configurableRightsPoolBase = `${base}/configurable-rights-pool/contracts`

export const bFactory = 'BFactory'
export const crpFactory = 'CRPFactory'
export const crp = 'ConfigurableRightsPool'
export const pool = 'BPool'
export const aToken = 'AToken'
export const bToken = 'BToken'
export const reserveToken = 'ReserveToken'

export const path = (base:string, name:string) => `/${base}/${name}.sol/${name}.json`

export const bFactoryPath = path(balancerBase, bFactory)
export const crpFactoryPath = path(configurableRightsPoolBase, crpFactory)
export const crpPath = path(configurableRightsPoolBase, crp)
export const poolPath = path(balancerBase, pool)
export const aTokenPath = path(base, aToken)
export const bTokenPath = path(base, bToken)
export const reserveTokenPath = path(base, reserveToken)

export const bFactoryAddress = '0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9'
export const crpFactoryAddress = '0xa513e6e4b8f2a923d98304ec87f64353c4d5c853'
export const safeMathAddress = '0xdc64a140aa3e981100a9beca4e685f962f0cf6c9'
export const smartPoolManager = '0x0165878a594ca255338adfa4d48449f69242eb8f'
export const rightsManager = '0x5fc8d32690cc91d4c39d9d3abcbd16989f875707'

export const reserveTokenAddress = '0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0'
export const aTokenAddress = '0x5fbdb2315678afecb367f032d93f642f64180aa3'
export const bTokenAddress = '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512'