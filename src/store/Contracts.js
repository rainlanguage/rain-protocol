import { createWritableLocalStore } from './localStorage'
import * as Constants from './Constants'

const key = 'Contracts'

/// Initial values for all the contracts that are deployed with the deploy script.
/// These are all known ahead of time for this GUI.
const init = {
    [Constants.bFactoryPath]: Constants.bFactoryAddress,
    [Constants.crpFactoryPath]: Constants.crpFactoryAddress,
    [Constants.reserveTokenPath]: Constants.reserveTokenAddress,
    [Constants.aTokenPath]: Constants.aTokenAddress,
    [Constants.bTokenPath]: Constants.bTokenAddress,
}

export let store = createWritableLocalStore(key, init);

store.useLocalStorage()
