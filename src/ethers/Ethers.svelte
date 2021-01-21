<script>
import { ethers } from "ethers"

export let contractAbi
export let contractAddress;

let userAddress
let userEthBalance

const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545', ethers.networks.unspecified)
let privateKey = "0x0123456789012345678901234567890123456789012345678901234567890123";
const signer = provider.getSigner()
// let signer = new ethers.Wallet(privateKey);

console.log(signer)

signer.getAddress().then((a) => userAddress = a)

$: if (userAddress) {
  provider.getBalance(userAddress).then(b => userEthBalance = b)
}

let contract
$: if (contractAddress && contractAbi) {
  contract = new ethers.Contract(contractAddress, contractAbi, signer);
  console.log(contract)
}

let totalSupply
let name
let symbol
let userTokenBalance
$: if (contract && userAddress) {
  contract.totalSupply().then(s => totalSupply = s)
  contract.name().then(n => name = n)
  contract.symbol().then(s => symbol = s)
  contract.balanceOf(userAddress).then(b => userTokenBalance = b)
}

createDisabled = true
const crpFactoryAddress = '0x992a87203f982Ed89C20F58ba92F2780a2DFf45e'
const bFactoryAddress = '0x1eF7fF688dC7dB328892a283AfdF7DC75781e878'
let crpFactoryAbi
$: fetch('/abi/balancer/CRPFactory.json')
  .then(response => response.json())
  .then(data => crpFactoryAbi = data.abi)
let crpFactoryContract
$: if (crbFactoryAbi && crpFactoryAddress && signer) {
  crpFactoryContract = new ethers.Contract(crpFactoryAddress, crpFactoryAbi, signer)
  createDisabled = false
}
const makeBalancerPool = () => {
  let poolParams = {
    poolTokenSymbol = "RESTKNA",
    poolTokenName = "RES/TKNA",

  }
  crpFactoryContract.newCrp(
    bFactoryAddress,

  )
}

</script>

<div>

<h2 class="text-4xl">User details</h2>

<table class="border-separate border border-pacific-rim-uprising-1">
  <tr>
    <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
      User address
    </td>
    <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
      {userAddress}
    </td>
  </tr>
  <tr>
    <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
      User ETH balance
    </td>
    <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
      {userEthBalance}
    </td>
  </tr>
</table>

<h2 class="text-4xl">Contract details</h2>

<table class="border-separate border border-pacific-rim-uprising-1">
  <tr>
    <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
      Contract Name
    </td>
    <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
      {name}
    </td>
  </tr>
  <tr>
    <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
      Contract Symbol
    </td>
    <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
      {symbol}
    </td>
  </tr>
  <tr>
    <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
      Contract address
    </td>
    <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
      {contractAddress}
    </td>
  </tr>
  <tr>
    <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
      Total supply
    </td>
    <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
      {totalSupply}
    </td>
  </tr>
  <tr>
    <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
      User balance
    </td>
    <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
      {userTokenBalance}
    </td>
  </tr>
</table>

<div>
  <submit disabled={createDisabled} on:click="{makeBalancerPool}" value="make balancer pool">
</div>

</div>
