<script>
import { ethers } from 'ethers'

export let provider
export let contracts
export let tokenKey

let crpFactoryAddress
$: if (contracts) {
  crpFactoryAddress = contracts["CRPFactory"]
}

let bFactoryAddress
$: if (contracts) {
  bFactoryAddress = contracts["BFactory"]
}

let reserveTokenAddress
$: if (contracts) {
  reserveTokenAddress = contracts["ReserveToken"]
}

let tokenAddress
$: if (contracts) {
  tokenAddress = contracts[tokenKey]
}

const signer = provider.getSigner()

let createDisabled = true
let crpFactoryAbi
$: fetch('/abi/balancer/CRPFactory.json')
  .then(response => response.json())
  .then(data => crpFactoryAbi = data.abi)
let crpFactoryContract
$: if (crpFactoryAbi && crpFactoryAddress && signer) {
  crpFactoryContract = new ethers.Contract(crpFactoryAddress, crpFactoryAbi, signer)
}

let bFactoryAbi
$: fetch('/abi/balancer/BFactory.json')
  .then(response => response.json())
  .then(data => bFactoryAbi = data.abi)
let bFactoryContract
$: if (bFactoryAbi && bFactoryAddress && signer) {
  bFactoryContract = new ethers.Contract(bFactoryAddress, bFactoryAbi, signer)
}

$: if(crpFactoryContract && bFactoryContract) {
  createDisabled = false
}

let crpContract
const makeBalancerPool = () => {
  let poolParams = {
    poolTokenSymbol: "RTA",
    poolTokenName: "RES/TKNA",
    constituentTokens: [reserveTokenAddress, tokenAddress],
    tokenBalances: [BigInt(1), BigInt(20)],
    tokenWeights: [BigInt(1), BigInt(20)],
    swapFee: BigInt(1)
  }
  let poolPermissions = {
    canPauseSwapping: true,
    canChangeSwapFee: false,
    canChangeWeights: true,
    canAddRemoveTokens: true,
    canWhitelistLPs: false,
    canChangeCap: false
  }
  console.log(poolParams)
  console.log(poolPermissions)
  console.log(crpFactoryContract)
  console.log(bFactoryContract)
  bFactoryContract.getColor().then(d => console.log(d))
  let crpContract = crpFactoryContract.newCrp(
    bFactoryAddress,
    poolParams.poolTokenSymbol,
    poolParams.constituentTokens,
    poolParams.tokenBalances,
    poolParams.tokenWeights,
    poolParams.swapFee,
    poolPermissions
  ).then(c => {
    console.log(c);
    crpContract = c
  })
}
</script>

<div>
  <input type="submit" disabled={createDisabled} on:click="{makeBalancerPool}" value="make balancer pool">
</div>
