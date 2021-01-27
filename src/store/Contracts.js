import { createWritableLocalStore } from './localStorage'

const key = 'Contracts'
const init = {}

export let store = createWritableLocalStore(key, init);

store.useLocalStorage()

store.subscribe(v => {
  if (Object.entries(v).length === 0) {
    fetch('/contracts.json')
    .then(raw => raw.json())
    .then(parsed => {
      store.update(_ => parsed)
    })
  }
})
