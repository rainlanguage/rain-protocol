import { writable } from 'svelte/store'

const TICK_TIME = 7000
export let store = writable(1)

setInterval(() => store.update(t => t + 1), TICK_TIME)
