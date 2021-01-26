<script>
import { ethers } from "ethers"
import UserDetails from './UserDetails.svelte'
import TokenDetails from './TokenDetails.svelte'
import CreatePool from './CreatePool.svelte'

export let tick
export let tokenKey

let contracts
$: fetch('/contracts.json')
  .then(response => response.json())
  .then(data => contracts = data)

const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545', ethers.networks.unspecified)

</script>

<div>

<UserDetails tick={tick} provider={provider} />

<TokenDetails tick={tick} provider={provider} contracts={contracts} tokenKey={tokenKey} />
<TokenDetails tick={tick} provider={provider} contracts={contracts} tokenKey={"ReserveToken"} />

<CreatePool
  tick={tick}
  provider={provider}
  contracts={contracts}
  tokenKey={tokenKey}
/>

</div>
