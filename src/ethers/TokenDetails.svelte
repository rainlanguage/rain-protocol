<script>
import { ethers } from 'ethers'
import * as Contracts from '../store/Contracts'
import * as ABI from '../store/ABI'
import * as Tick from '../store/Tick'
import * as Provider from '../store/Provider'

export let tokenKey

let tick
Tick.store.subscribe(v => tick = v)

let contractAddresses
Contracts.store.subscribe(v => contractAddresses = v)

let contractAbis
ABI.store.subscribe(v => contractAbis = v)

let userAddress
Provider.signer.getAddress().then(a => userAddress = a)

let contract
$: if (!contract && contractAddresses[tokenKey] && contractAbis[tokenKey]) {
  console.log(Provider.signer)
  contract = new ethers.Contract(contractAddresses[tokenKey], contractAbis[tokenKey], Provider.signer);
  console.log(contract)
}

let totalSupply
let name
let symbol
let userTokenBalance
$: if (contract && userAddress && tick) {
  contract.totalSupply().then(s => totalSupply = s)
  contract.name().then(n => name = n)
  contract.symbol().then(s => symbol = s)
  contract.balanceOf(userAddress).then(b => userTokenBalance = b)
}
</script>

<h2 class="text-4xl">{name} details</h2>

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
      Token address
    </td>
    <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
      {contractAddresses[tokenKey]}
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
