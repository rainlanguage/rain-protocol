<script>
import { ethers } from "ethers"
import UserDetails from './UserDetails.svelte'
import TokenDetails from './TokenDetails.svelte'
import CreatePool from './CreatePool.svelte'

export let tick
export let tokenKey

const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545', ethers.networks.unspecified)

</script>

<div>

<UserDetails tick={tick} provider={provider} />

<TokenDetails tick={tick} provider={provider} tokenKey={tokenKey} />
<TokenDetails tick={tick} provider={provider} tokenKey={"ReserveToken"} />

<CreatePool
  tick={tick}
  provider={provider}
  tokenKey={tokenKey}
/>

</div>
