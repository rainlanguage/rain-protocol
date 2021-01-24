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

let bFactoryAbi
$: fetch('/contracts/BFactory.json')
  .then(response => response.json())
  .then(data => bFactoryAbi = data.abi)
let bFactoryContract
$: if (bFactoryAbi && bFactoryAddress && signer) {
  bFactoryContract = new ethers.Contract(bFactoryAddress, bFactoryAbi, signer)
  bFactoryContract.on("LOG_NEW_POOL", (p) => console.log('p', p))
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
    tokenBalances: [Math.pow(10, 14), 2 * Math.pow(10, 15)],
    tokenWeights: [1, 20],
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

  crpFactoryContract.once('LogNewCrp', (crpAddress) => {
    crpContract = new ethers.Contract(crpAddress, crpAbi, signer)
    crpContract.on("Transfer", t => console.log('t', t))
    crpContract.on("LogCall", t => console.log('t', t))
    crpContract.on("CapChanged", t => console.log('t', t))
    crpContract.on("Approval", t => console.log('t', t))
    crpContract.on("LogExit", t => console.log('t', t))
    crpContract.on("LogJoin", t => console.log('t', t))
    crpContract.on("NewTokenCommitted", t => console.log('t', t))
    crpContract.on("OwnershipTransferred", t => console.log('t', t))
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
  reserveTokenContract.approve(crpContract.address, BigInt(Math.pow(10, 20)))
  reserveTokenContract.once('Approval', () => reserveApproved = true)
}

let tokenApproved
$: if (crpContract) {
  let tokenContract = new ethers.Contract(tokenAddress, tokenAbi, signer)
  tokenContract.approve(crpContract.address, BigInt(Math.pow(10, 20)))
  tokenContract.once('Approval', () => tokenApproved = true)
}

let poolContract
const createBalancerPool = async () => {
  console.log(crpContract)
  console.log(crpContract['createPool(uint256,uint256,uint256)'])
  let pool = crpContract['createPool(uint256,uint256,uint256)'](BigInt(Math.pow(10, 22)), 1, 1)
    .then(p => console.log('p', p))
  console.log(pool)
  console.log(provider)
}

let showLogs = async () => {
  console.log(await provider.getLogs({fromBlock: 0}))
}

</script>

<div>
  {#if crpContract }
    <h2 class="text-4xl">Pool details</h2>

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
</div>
