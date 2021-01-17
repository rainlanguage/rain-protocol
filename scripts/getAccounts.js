module.exports = async (done) => {
  let accounts = await web3.eth.getAccounts()
  console.log(accounts)

  for (const account of accounts) {
    console.log('foo')
    const balance = await web3.eth.getBalance(account)
    console.log(account, balance)
  }

  done()
}
