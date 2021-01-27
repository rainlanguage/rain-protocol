<script>
import { ethers } from 'ethers'
import * as Contracts from '../store/Contracts'
import * as ABI from '../store/ABI'
import * as Keys from '../store/Keys'

export let tick
export let provider
export let tokenKey

let contractAddresses
Contracts.store.subscribe(v => contractAddresses = v)

$: console.log(contractAddresses)

let contractAbis
ABI.store.subscribe(v => contractAbis = v)

const signer = provider.getSigner()

let crpFactoryContract
$: if (contractAddresses[Keys.crpFactory] && contractAbis[Keys.crpFactory] && signer) {
  crpFactoryContract = new ethers.Contract(contractAddresses[Keys.crpFactory], contractAbis[Keys.crpFactory], signer)
}

$: if (crpFactoryContract && !contractAddresses[Keys.crp]) {
  crpFactoryContract.on('LogNewCrp', (caller, crpAddress) => {
    Contracts.store.update(v => {
      console.log(v)
      v[Keys.crp] = crpAddress
      return v
    })
  })

  let poolParams = {
    poolTokenSymbol: `${Keys.reserveToken}${tokenKey}`,
    poolTokenName: `${Keys.reserveToken}${tokenKey} trading pool`,
    constituentTokens: [contractAddresses[Keys.reserveToken], contractAddresses[tokenKey]],
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

  crpFactoryContract.newCrp(
    contractAddresses[Keys.bFactory],
    poolParams,
    poolPermissions,
  );
}

let bFactoryContract
$: if (contractAddresses[Keys.bFactory] && contractAbis[Keys.bFactory] && signer) {
  console.log('bFactory')
  bFactoryContract = new ethers.Contract(contractAddresses[Keys.bFactory], contractAbis[Keys.bFactory], signer)
  bFactoryContract.on("LOG_NEW_POOL", (caller, address) => Contracts.store.update(v => {
    console.log('b', v)
    v[tokenKey + Keys.pool] = address
    return v
  }))
}

let crpContract
const createPool = async (contract) => {
  console.log('prepool', contract)
  let pool = await contract['createPool(uint256,uint256,uint256)'](BigInt(Math.pow(10, 20)), 1, 1)
  console.log(pool)
}
$: if (bFactoryContract && contractAddresses[Keys.crp] && !contractAddresses[tokenKey + Keys.pool]) {
  console.log('foo')
  crpContract = new ethers.Contract(contractAddresses[Keys.crp], contractAbis[Keys.crp], signer)
  crpContract.on("Transfer", (from, to, amount) => console.log('Transfer', from, to, amount))
  crpContract.on("LogCall", (bytes4, addressPayable, bytesCalldataPtr) => console.log('LogCall', bytes4, addressPayable, bytesCalldataPtr))
  crpContract.on("CapChanged", (caller, oldCap, newCap) => console.log('CapChanged', caller, oldCap, newCap))
  crpContract.on("Approval", (owner, spender, value) => console.log('Approval', owner, spender, value))
  crpContract.on("LogExit", (owner, tokenOut, tokenAmountOut) => console.log('LogExit', owner, tokenOut, tokenAmountOut))
  crpContract.on("LogJoin", (owner, tokenIn, tokenAmountIn) => console.log('LogJoin', owner, tokenIn, tokenAmountIn))
  crpContract.on("NewTokenCommitted", (token, pool, caller) => console.log('NewTokenCommitted', token, pool, caller))
  crpContract.on("OwnershipTransferred", (previousOwner, newOwner) => console.log('OwnershipTransferred', previousOwner, newOwner))
  console.log('bar')
  createPool(crpContract)
}

const approve = (key, approved) => {
  let contract = new ethers.Contract(contractAddresses[key], contractAbis[key], signer)
  contract.approve(contractAddresses[key], BigInt(Math.pow(10, 30)))
  contract.once('Approval', (owner, spender, value) => approved = true)
}

let reserveApproved
$: if (contractAddresses[Keys.crp] && contractAddresses[Keys.reserveToken] && contractAbis[Keys.reserveToken]) {
  approve(Keys.reserveToken, reserveApproved)
}
let tokenApproved
$: if (contractAddresses[Keys.crp] && contractAddresses[tokenKey] && contractAbis[tokenKey]) {
  approve(tokenKey, tokenApproved)
}

let poolContract
$: if (contractAddresses[tokenKey + Keys.pool] && contractAbis[Keys.pool] && signer) {
  poolContract = new ethers.Contract(contractAddresses[tokenKey + Keys.pool], contractAbis[Keys.pool], signer)
}

let poolTokens
$: if(!poolTokens && contractAddresses[Keys.pool] && contractAbis[Keys.pool] && signer) {
  poolContract = new ethers.Contract(contractAddresses[Keys.pool], contractAbis[Keys.pool], signer)
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

let showLogs = async () => {
  console.log(await provider.getLogs({fromBlock: 0}))
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
