import { createWritableLocalStore } from './localStorage'
import * as Constants from './Constants'

const key = 'ABI'
const init = {}

export let store = createWritableLocalStore(key, init);

store.useLocalStorage()

const toLoad = [
  Constants.bFactoryPath,
  Constants.crpFactoryPath,
  Constants.crpPath,
  Constants.poolPath,
  Constants.aTokenPath,
  Constants.bTokenPath,
  Constants.reserveTokenPath,
]

console.log(toLoad)

store.subscribe(v => {
  for (const p of toLoad) {
    console.log(p)
    if (!v[p]) {
      fetch(p)
      .then(raw => raw.json())
      .then(parsed => store.update(v => {
        v[p] = parsed.abi
        return v
      }))
    }
  }
})

store.subscribe(v => console.log(v))
