import { writable } from 'svelte/store'
import { ethers } from "ethers"

export const store = writable(
  new ethers.providers.JsonRpcProvider('http://localhost:8545', ethers.networks.unspecified)
)

export let signer
store.subscribe(v => signer = v.getSigner())
