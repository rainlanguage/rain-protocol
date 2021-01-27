import { createWritableLocalStore } from './localStorage'
import * as Keys from './Keys'

const key = 'ABIv3'
const init = {}

export let store = createWritableLocalStore(key, init);

store.useLocalStorage()

const toLoad = [
  Keys.bFactory,
  Keys.crpFactory,
  Keys.crp,
  Keys.aToken,
  Keys.bToken,
  Keys.reserveToken,
]

store.subscribe(v => {
  for (const l of toLoad) {
    if (!v[l]) {
      fetch(`/contracts/${l}.json`)
      .then(raw => raw.json())
      .then(parsed => store.update(v => {
        v[l] = parsed.abi
        return v
      }))
    }
  }
})
