<script>
import { ethers } from 'ethers'
import * as ABI from '../store/ABI'
import * as Contracts from '../store/Contracts'
import * as Constants from '../store/Constants'
import * as Tick from '../store/Tick'
import * as Provider from '../store/Provider'

const ONE = Math.pow(10, 18)

export let tokenKey

let tick
Tick.store.subscribe(v => tick = v)

let contractAddresses
$: console.info('contractAddresses', contractAddresses)
Contracts.store.subscribe(v => contractAddresses = v)

let contractAbis
$: console.info('contractAbis', contractAbis)
ABI.store.subscribe(v => contractAbis = v)

let crpFactoryContract
$: console.info(crpFactoryContract, contractAddresses, contractAbis, Constants, Provider.signer)
$: if (!crpFactoryContract && contractAddresses[Constants.crpFactoryPath] && contractAbis[Constants.crpFactoryPath] && Provider.signer) {
  console.info('CreatePool crpFactoryContract')
  crpFactoryContract = new ethers.Contract(contractAddresses[Constants.crpFactoryPath], contractAbis[Constants.crpFactoryPath], Provider.signer)
}

$: if (crpFactoryContract && !contractAddresses[Constants.crpPath]) {
  crpFactoryContract.on('LogNewCrp', (caller, crpAddress) => {
    Contracts.store.update(v => {
      v[Constants.crpPath] = crpAddress
      return v
    })
  })

  let poolParams = {
    poolTokenSymbol: `${Constants.reserveToken}${tokenKey}`,
    poolTokenName: `${Constants.reserveToken}${tokenKey} trading pool`,
    constituentTokens: [contractAddresses[Constants.reserveTokenPath], contractAddresses[tokenKey]],
    tokenBalances: [BigInt(ONE * 1000), BigInt(ONE * 1000)],
    tokenWeights: [BigInt(ONE), BigInt(2 * ONE)],
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

  console.info(
    'newCrp',
    contractAddresses[Constants.bFactoryPath],
    poolParams,
    poolPermissions
  )
  crpFactoryContract['newCrp(address,(string,string,address[],uint256[],uint256[],uint256),(bool,bool,bool,bool,bool,bool))'](
    contractAddresses[Constants.bFactoryPath],
    poolParams,
    poolPermissions,
  );
}

let bFactoryContract
$: if (!bFactoryContract && contractAddresses[Constants.bFactoryPath] && contractAbis[Constants.bFactoryPath] && Provider.signer) {
  bFactoryContract = new ethers.Contract(contractAddresses[Constants.bFactoryPath], contractAbis[Constants.bFactoryPath], Provider.signer)
  bFactoryContract.on("LOG_NEW_POOL", (caller, address) => {
    Contracts.store.update(v => {
      v[tokenKey + Constants.pool] = address
      return v
    })
  })
}

let crpContract
$: if (!crpContract && bFactoryContract && contractAddresses[Constants.crpPath]) {
  crpContract = new ethers.Contract(contractAddresses[Constants.crpPath], contractAbis[Constants.crpPath], Provider.signer)
  crpContract.on("Transfer", (from, to, amount) => console.log('Transfer', from, to, amount))
  crpContract.on("LogCall", (bytes4, addressPayable, bytesCalldataPtr) => console.log('LogCall', bytes4, addressPayable, bytesCalldataPtr))
  crpContract.on("CapChanged", (caller, oldCap, newCap) => console.log('CapChanged', caller, oldCap, newCap))
  crpContract.on("Approval", (owner, spender, value) => console.log('Approval', owner, spender, value))
  crpContract.on("LogExit", (owner, tokenOut, tokenAmountOut) => console.log('LogExit', owner, tokenOut, tokenAmountOut))
  crpContract.on("LogJoin", (owner, tokenIn, tokenAmountIn) => console.log('LogJoin', owner, tokenIn, tokenAmountIn))
  crpContract.on("NewTokenCommitted", (token, pool, caller) => console.log('NewTokenCommitted', token, pool, caller))
  crpContract.on("OwnershipTransferred", (previousOwner, newOwner) => console.log('OwnershipTransferred', previousOwner, newOwner))
}

let reserveApproved
$: if (!reserveApproved && crpContract && contractAddresses[Constants.reserveTokenPath] && contractAbis[Constants.reserveTokenPath]) {
  console.info('approve reserve')
  let reserveContract = new ethers.Contract(contractAddresses[Constants.reserveTokenPath], contractAbis[Constants.reserveTokenPath], Provider.signer)
  reserveContract.approve(crpContract.address, BigInt(ONE * 1000000))
  reserveContract.once('Approval', () => reserveApproved = true)
}
let tokenApproved
$: if (!tokenApproved && crpContract && contractAddresses[tokenKey] && contractAbis[tokenKey]) {
  console.info('approve token')
  let tokenContract = new ethers.Contract(contractAddresses[tokenKey], contractAbis[tokenKey], Provider.signer)
  tokenContract.approve(crpContract.address, BigInt(ONE * 1000000))
  tokenContract.once('Approval', () => tokenApproved = true)
}

$: if (crpContract && reserveApproved && tokenApproved && !contractAddresses[tokenKey + Constants.pool]) {
  console.info('creating pool', crpContract)
  crpContract['createPool(uint256,uint256,uint256)'](BigInt(ONE * 100), 1, 1)
}

let poolContract
$: if (contractAddresses[tokenKey + Constants.pool] && contractAbis[Constants.poolPath] && Provider.signer) {
  console.log('foo')
  poolContract = new ethers.Contract(contractAddresses[tokenKey + Constants.pool], contractAbis[Constants.poolPath], Provider.signer)
}
$: console.log('pool', poolContract, contractAddresses, contractAddresses[tokenKey + Constants.pool], contractAbis)

let poolTokens
$: if(!poolTokens && poolContract && Provider.signer) {
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
  console.info('updateWeightsGradually')
  crpContract.updateWeightsGradually(
    [BigInt(ONE * 2), BigInt(ONE)],
    0,
    10000,
  )
  weightCurveIsSet = true
}

let poolTokenBalance
let poolReserveBalance
$: if (tick && poolContract) {
  console.info('pool balance')
  poolContract.getBalance(contractAddresses[Constants.reserveTokenPath]).then(v => poolReserveBalance = v)
  poolContract.getBalance(contractAddresses[tokenKey]).then(v => poolTokenBalance = v)
}
$: if (tick && poolContract && crpContract && weightCurveIsSet) {
  crpContract.pokeWeights()
}

let reservePoolApproved
$: if (!reservePoolApproved && poolContract && contractAddresses[Constants.reserveTokenPath] && contractAbis[Constants.reserveToken]) {
  console.info('approve reserve pool')
  let reserveContract = new ethers.Contract(contractAddresses[Constants.reserveTokenPath], contractAbis[Constants.reserveToken], Provider.signer)
  reserveContract.approve(poolContract.address, BigInt(ONE * 1000000))
  reserveContract.once('Approval', () => reservePoolApproved = true)
}
let tokenPoolApproved
$: if (!tokenPoolApproved && poolContract && contractAddresses[tokenKey] && contractAbis[tokenKey]) {
  console.info('approve token pool')
  let tokenContract = new ethers.Contract(contractAddresses[tokenKey], contractAbis[tokenKey], Provider.signer)
  tokenContract.approve(poolContract.address, BigInt(ONE * 1000000))
  tokenContract.once('Approval', () => tokenPoolApproved = true)
}

$: console.log(reserveApproved, tokenPoolApproved)

let buyPrice = BigInt(0)
let toBuy = BigInt(ONE * 10)
$: buyTotal = BigInt(buyPrice || 0) * BigInt(toBuy || 0)
$: if (tick && poolContract && crpContract && weightCurveIsSet) {
  poolContract.getSpotPrice(contractAddresses[Constants.reserveTokenPath], contractAddresses[tokenKey]).then(v => buyPrice = BigInt(v))
}
const buyIt = () => {
  poolContract.swapExactAmountIn(
    contractAddresses[Constants.reserveTokenPath],
    toBuy,
    contractAddresses[tokenKey],
    0,
    buyPrice * BigInt(1000)
  )
}

let sellPrice = BigInt(0)
let toSell = BigInt(ONE * 10)
$: sellTotal = BigInt(sellPrice || 0) * BigInt(toSell || 0)
$: if (tick && poolContract && crpContract && weightCurveIsSet) {
  poolContract.getSpotPrice(contractAddresses[tokenKey], contractAddresses[Constants.reserveTokenPath]).then(v => sellPrice = BigInt(v))
}
const sellIt = () => {
  poolContract.swapExactAmountIn(
    contractAddresses[tokenKey],
    toSell,
    contractAddresses[Constants.reserveTokenPath],
    0,
    sellPrice * BigInt(1000)
  )
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
          Reserve balance
        </td>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          {poolReserveBalance}
        </td>
      </tr>
      <tr>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          Token balance
        </td>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          {poolTokenBalance}
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

    {#if reservePoolApproved && tokenPoolApproved }

    <h2 class="text-4xl">Buy tokens</h2>
    <table class="border-separate border border-pacific-rim-uprising-1">
      <tr>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          Buy price (inc fees.)
        </td>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          {buyPrice}
        </td>
      </tr>
      <tr>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          To buy
        </td>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          <input type="number" bind:value={toBuy} />
        </td>
      </tr>
      <tr>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          Total cost
        </td>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          {buyTotal}
        </td>
      </tr>
      <tr>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          Buy it!
        </td>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          <input type="submit" on:click={buyIt} />
        </td>
      </tr>
    </table>

    <h2 class="text-4xl">Sell tokens</h2>
    <table class="border-separate border border-pacific-rim-uprising-1">
      <tr>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          Sell price (inc fees.)
        </td>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          {sellPrice}
        </td>
      </tr>
      <tr>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          To sell
        </td>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          <input type="number" bind:value={toSell} />
        </td>
      </tr>
      <tr>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          Total cost
        </td>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          {sellTotal}
        </td>
      </tr>
      <tr>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          Sell it!
        </td>
        <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
          <input type="submit" on:click={sellIt} />
        </td>
      </tr>
    </table>

    {/if}

  {/if}
</div>
