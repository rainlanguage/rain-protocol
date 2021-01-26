<script>
export let tick
export let provider

const signer = provider.getSigner()

let userEthBalance

let userAddress
signer.getAddress().then((a) => userAddress = a)

$: if (userAddress && tick) {
  provider.getBalance(userAddress).then(b => userEthBalance = b)
}
</script>

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
