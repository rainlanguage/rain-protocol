// a simple deploy script for testing the TVKPrestige GUI locally.

import { ethers } from 'hardhat'
import type { TVKPrestige } from '../typechain/TVKPrestige'
import hre from 'hardhat'
import { erc20ABI } from '../test/erc20-abi'

// constants you may want to change before testing
const TEST_ADDRESS = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
const TEST_ADDRESS_2 = "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65"
const TVK_AMOUNT = 1000000

// other constants
const eighteenZeros = '000000000000000000'
const TVK_CONTRACT_ADDRESS = '0xd084B83C305daFD76AE3E1b4E1F1fe2eCcCb3988'
const TVK_TREASURY_ADDRESS = '0x197d188218dCF572A1e5175CCdaC783ee0E6734A'

async function main() {

    // reset the fork
    await hre.network.provider.request({
        method: "hardhat_reset",
        params: [{
        forking: {
            jsonRpcUrl: "https://eth-mainnet.alchemyapi.io/v2/0T6PEQIu3w1qwoPoPG3XPJHvKAzXEjkv",
            // blockNumber: 12206000
        }
        }]
    })

    // deploy TVKPrestige
    const tvkprestigeFactory = await hre.ethers.getContractFactory(
        'TVKPrestige'
    );

    const tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige
    let deployedTvkPrestige = await tvkPrestige.deployed()
    console.log('TVKPrestige deployed to ' + deployedTvkPrestige.address)

    // impersonate the TVK treasury
    await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [TVK_TREASURY_ADDRESS]}
    )

    const tvkSigner = await ethers.provider.getSigner(TVK_TREASURY_ADDRESS)
    const tvkTokenForWhale = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, tvkSigner)

    // transfer TVK amount to the test addresses
    await tvkTokenForWhale.transfer(TEST_ADDRESS, TVK_AMOUNT + eighteenZeros)
    await tvkTokenForWhale.transfer(TEST_ADDRESS_2, TVK_AMOUNT + eighteenZeros)

    // get balance of TVK for test addresses
    const tvkToken = new ethers.Contract(TVK_CONTRACT_ADDRESS, erc20ABI, tvkSigner)
    const balance = await tvkToken.balanceOf(TEST_ADDRESS)
    const balance_2 = await tvkToken.balanceOf(TEST_ADDRESS_2)
    console.log('Balance for ' + TEST_ADDRESS + ' is ' + balance)
    console.log('Balance for ' + TEST_ADDRESS_2 + ' is ' + balance_2)

    await hre.network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: ["0x197d188218dCF572A1e5175CCdaC783ee0E6734A"]}
    )

    // set allowance for TVK prestige contract
    // await tvkToken.approve(deployedTvkPrestige.address, TVK_CONTRACT_ADDRESS + eighteenZeros)
}

main()
