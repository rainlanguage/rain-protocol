import { createWritableLocalStore } from './localStorage'

const key = 'Contracts.v7'
const init = null

export let store = createWritableLocalStore(key, init);

store.useLocalStorage()

store.subscribe(v => {
  if (!v) {
    fetch('/contracts.json')
    .then(raw => raw.json())
    .then(parsed => {
      store.update(_ => parsed)
    })
  }
})
