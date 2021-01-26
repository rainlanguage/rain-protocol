<script>
import { ethers } from 'ethers'
export let tick
export let provider
export let contracts
export let tokenKey

let tokenAddress
$: if (contracts) {
  tokenAddress = contracts[tokenKey]
}

let tokenAbi
$: if (tokenKey) {
  fetch(`/abi/token/${tokenKey}.json`)
    .then(response => response.json())
    .then(data => tokenAbi = data.abi)
}

const signer = provider.getSigner()

let userAddress
signer.getAddress().then((a) => userAddress = a)

let contract
$: if (tokenAddress && tokenAbi) {
  contract = new ethers.Contract(tokenAddress, tokenAbi, signer);
}

let totalSupply
let name
let symbol
let userTokenBalance
$: if (contract && userAddress && tick) {
  contract.totalSupply().then(s => totalSupply = s)
  contract.name().then(n => name = n)
  contract.symbol().then(s => symbol = s)
  contract.balanceOf(userAddress).then(b => {
    userTokenBalance = b
  })
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
      {tokenAddress}
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
