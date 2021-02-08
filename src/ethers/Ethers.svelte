<script>
import { constants, ethers } from "ethers"
import UserDetails from './UserDetails.svelte'
import TokenDetails from './TokenDetails.svelte'
import CreatePool from './CreatePool.svelte'
import * as Tick from '../store/Tick'
import * as Constants from '../store/Constants'

export let tokenKey

let tick
Tick.store.subscribe(v => tick = v)

</script>

<div>

<UserDetails />

<TokenDetails tokenKey={tokenKey} />
<TokenDetails tokenKey={Constants.reserveTokenPath} />

<CreatePool tokenKey={tokenKey} />

</div>
