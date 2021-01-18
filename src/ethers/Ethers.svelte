<script>
import { ethers } from "ethers"

export let contractAbi

const provider = new ethers.providers.JsonRpcProvider('http://localhost:7545', ethers.networks.unspecified)
let privateKey = "0x0123456789012345678901234567890123456789012345678901234567890123";
const signer = provider.getSigner()
// let signer = new ethers.Wallet(privateKey);


export let contractAddress;

let address
let balance

console.log(signer)

signer.getAddress().then((a) => address = a)

$: if (address) {
  provider.getBalance(address).then(b => balance = b)
}

let contract = new ethers.Contract(contractAddress, contractAbi, signer);
console.log(contract)

let totalSupply = '';
contract.totalSupply().then(s => totalSupply = s)

let name = '';
contract.name().then(n => name = n)

let symbol = '';
contract.symbol().then(s => symbol = s)

let userBalance = '';
$: if (address) {
  contract.balanceOf(address).then(b => userBalance = b)
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
      {address}
    </td>
  </tr>
  <tr>
    <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
      User balance
    </td>
    <td class="border-separate border border-pacific-rim-uprising-1 bg-white">
      {balance}
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
      {userBalance}
    </td>
  </tr>
</table>

</div>
