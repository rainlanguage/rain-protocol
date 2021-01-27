<script>
import { ethers } from "ethers"
import UserDetails from './UserDetails.svelte'
import TokenDetails from './TokenDetails.svelte'
import CreatePool from './CreatePool.svelte'
import * as Tick from '../store/Tick'

export let tokenKey

let tick
Tick.store.subscribe(v => tick = v)

const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545', ethers.networks.unspecified)

</script>

<div>

<UserDetails provider={provider} />

<TokenDetails provider={provider} tokenKey={tokenKey} />
<TokenDetails provider={provider} tokenKey={"ReserveToken"} />

<CreatePool
  provider={provider}
  tokenKey={tokenKey}
/>

</div>
