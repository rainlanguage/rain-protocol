const fetch = require('node-fetch')

const threshold = 500000000000000000
const pauseFor = 60 * 1000

// https://faucet.ropsten.be/
module.exports = async (done) => {
  let accounts = await web3.eth.getAccounts()
  console.log(accounts)

  for (const account of accounts) {
    const balance = await web3.eth.getBalance(account)
    console.log(account, balance)
    if ( balance <= threshold) {
      console.log('account balance below threshold, requesting faucet')

      const url = `https://faucet.${process.env.INFURA_NETWORK}.be/donate/${account}`
      response = await fetch(url)

      console.log(await response.json())

      console.log('waiting a few seconds to avoid grey list')
      await new Promise(resolve => setTimeout(resolve, pauseFor))
    }

  }

  done()
}
