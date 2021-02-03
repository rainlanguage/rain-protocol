import { createWritableLocalStore } from './localStorage'
import * as Keys from './Keys'

const key = 'ABI'
const init = {}

export let store = createWritableLocalStore(key, init);

store.useLocalStorage()

const toLoad = [
  `${Keys.configurableRightsPool}/${Keys.bFactory}`,
  `${Keys.configurableRightsPool}/${Keys.crpFactory}`,
  `${Keys.configurableRightsPool}/${Keys.crp}`,
  `${Keys.configurableRightsPool}/${Keys.pool}`,
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

store.subscribe(v => console.log(v))
