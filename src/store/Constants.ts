export const base = 'contracts/'
export const balancerBase = `${base}configurable-rights-pool/contracts/test`
export const configurableRightsPoolBase = `${base}configurable-rights-pool/contracts`

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

export const reserveTokenAddress = '0xFC628dd79137395F3C9744e33b1c5DE554D94882'
export const aTokenAddress = '0x5fbdb2315678afecb367f032d93f642f64180aa3'
export const bTokenAddress = '0x6eD79Aa1c71FD7BdBC515EfdA3Bd4e26394435cC'