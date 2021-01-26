<script>
import { ethers } from 'ethers'

export let tick
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

let reserveTokenAbi
$: fetch('/contracts/ReserveToken.json')
  .then(response => response.json())
  .then(data => reserveTokenAbi = data.abi)

let tokenAbi
$: fetch('/contracts/AToken.json')
  .then(response => response.json())
  .then(data => tokenAbi = data.abi)

let createDisabled = true
let crpFactoryAbi
$: fetch('/contracts/CRPFactory.json')
  .then(response => response.json())
  .then(data => crpFactoryAbi = data.abi)
let crpFactoryContract
$: if (crpFactoryAbi && crpFactoryAddress && signer) {
  crpFactoryContract = new ethers.Contract(crpFactoryAddress, crpFactoryAbi, signer)
}

let poolAbi
$: fetch('/contracts/BPool.json')
  .then(response => response.json())
  .then(data => poolAbi = data.abi)
let poolContractAddress
let poolContract
const createBalancerPool = async () => {
  await crpContract['createPool(uint256,uint256,uint256)'](BigInt(Math.pow(10, 22)), 1, 1)
}
let poolTokens
$: if(poolContractAddress && poolAbi && signer) {
  poolContract = new ethers.Contract(poolContractAddress, poolAbi, signer)
  // poolContract.totalSupply().then(supply => poolTotalSupply = supply)
  // console.log(poolContract.totalSupply())
  poolContract.getCurrentTokens().then(tokens => poolTokens = tokens)
}
let poolWeights = {}
$: if (poolTokens && tick) {
  for (const t of poolTokens) {
    poolContract.getNormalizedWeight(t).then(weight => {
      poolWeights[t] = weight.toString()
    })
  }
}

let bFactoryAbi
$: fetch('/contracts/BFactory.json')
  .then(response => response.json())
  .then(data => bFactoryAbi = data.abi)
let bFactoryContract
$: if (bFactoryAbi && bFactoryAddress && signer) {
  bFactoryContract = new ethers.Contract(bFactoryAddress, bFactoryAbi, signer)
  bFactoryContract.on("LOG_NEW_POOL", (caller, poolAddress) => poolContractAddress = poolAddress)
  bFactoryContract.on("LOG_BLABS", (p) => console.log('p', p))
}

let crpAbi
$: fetch('/contracts/ConfigurableRightsPool.json')
  .then(response => response.json())
  .then(data => crpAbi = data.abi)

$: if(crpFactoryContract && bFactoryContract) {
  createDisabled = false
}

let crpContract
const defineBalancerPool = async () => {
  let poolParams = {
    poolTokenSymbol: "RTA",
    poolTokenName: "RES/TKNA",
    constituentTokens: [reserveTokenAddress, tokenAddress],
    tokenBalances: [BigInt(Math.pow(10, 19)), BigInt(2 * Math.pow(10, 20))],
    tokenWeights: [BigInt(Math.pow(10, 18)), BigInt(2 * Math.pow(10,19))],
    swapFee: Math.pow(10, 12)
  }
  let poolPermissions = {
    canPauseSwapping: true,
    canChangeSwapFee: false,
    canChangeWeights: true,
    canAddRemoveTokens: true,
    canWhitelistLPs: false,
    canChangeCap: false
  }

  crpFactoryContract.on('LogNewCrp', (caller, crpAddress) => {
    crpContract = new ethers.Contract(crpAddress, crpAbi, signer)
    crpContract.on("Transfer", (from, to, amount) => console.log('Transfer', from, to, amount))
    crpContract.on("LogCall", (bytes4, addressPayable, bytesCalldataPtr) => console.log('LogCall', bytes4, addressPayable, bytesCalldataPtr))
    crpContract.on("CapChanged", (caller, oldCap, newCap) => console.log('CapChanged', caller, oldCap, newCap))
    crpContract.on("Approval", (owner, spender, value) => console.log('Approval', owner, spender, value))
    crpContract.on("LogExit", (owner, tokenOut, tokenAmountOut) => console.log('LogExit', owner, tokenOut, tokenAmountOut))
    crpContract.on("LogJoin", (owner, tokenIn, tokenAmountIn) => console.log('LogJoin', owner, tokenIn, tokenAmountIn))
    crpContract.on("NewTokenCommitted", (token, pool, caller) => console.log('NewTokenCommitted', token, pool, caller))
    crpContract.on("OwnershipTransferred", (previousOwner, newOwner) => console.log('OwnershipTransferred', previousOwner, newOwner))
  })

  await crpFactoryContract.newCrp(
    bFactoryAddress,
    poolParams,
    poolPermissions,
  );
}

let reserveApproved
$: if (crpContract) {
  let reserveTokenContract = new ethers.Contract(reserveTokenAddress, reserveTokenAbi, signer)
  reserveTokenContract.approve(crpContract.address, BigInt(Math.pow(10, 40)))
  reserveTokenContract.once('Approval', () => reserveApproved = true)
}

let tokenApproved
$: if (crpContract) {
  let tokenContract = new ethers.Contract(tokenAddress, tokenAbi, signer)
  tokenContract.approve(crpContract.address, BigInt(Math.pow(10, 40)))
  tokenContract.once('Approval', () => tokenApproved = true)
}

let showLogs = async () => {
  console.log(await provider.getLogs({fromBlock: 0}))
}

let weightCurveIsSet
$: if (poolContract) {
  crpContract.updateWeightsGradually(
    [BigInt(Math.pow(10, 19)), BigInt(2 * Math.pow(10,18))],
    0,
    10000,
  )
  weightCurveIsSet = true
}

$: if (tick && poolContract && crpContract && weightCurveIsSet) {
  crpContract.pokeWeights()
}

</script>

<div>
  {#if crpContract }
    <h2 class="text-4xl">Pool definition details</h2>

    <table class="border-separate border border-pacific-rim-uprising-1">
      <tr>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          Contract address
        </td>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          {crpContract.address}
        </td>
      </tr>
    </table>
  {:else}
    <input type="submit" on:click="{defineBalancerPool}" value="define balancer pool" />
  {/if}

  {#if crpContract && reserveApproved && tokenApproved}
    <input type="submit" on:click="{createBalancerPool}" value="create balancer pool" />
  {/if}

  <input type="submit" on:click="{showLogs}" value="show logs" />

  {#if poolContract }
    <h2 class="text-4xl">Live pool details</h2>

    <table class="border-separate border border-pacific-rim-uprising-1">
      <tr>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          Contract address
        </td>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          {poolContract.address}
        </td>
      </tr>
      <tr>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          Included tokens
        </td>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          {poolTokens}
        </td>
      </tr>
      <tr>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          Weights
        </td>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          {JSON.stringify(poolWeights)}
        </td>
      </tr>
      <tr>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          Tick
        </td>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          {tick}
        </td>
      </tr>
    </table>
  {/if}
</div>
