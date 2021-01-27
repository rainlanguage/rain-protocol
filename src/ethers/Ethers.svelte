<script>
import { ethers } from "ethers"
import UserDetails from './UserDetails.svelte'
import TokenDetails from './TokenDetails.svelte'
import CreatePool from './CreatePool.svelte'
import * as Tick from '../store/Tick'

export let tokenKey

let tick
Tick.store.subscribe(v => tick = v)

</script>

<div>

<UserDetails />

<TokenDetails tokenKey={tokenKey} />
<TokenDetails tokenKey={"ReserveToken"} />

<CreatePool tokenKey={tokenKey} />

</div>
