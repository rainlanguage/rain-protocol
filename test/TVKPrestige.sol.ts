import chai from 'chai'
import { solidity } from 'ethereum-waffle'
import { ethers } from 'hardhat'
import type { TVKPrestige } from '../typechain/TVKPrestige'

chai.use(solidity)
const { expect, assert } = chai

const eighteenZeros = '000000000000000000'

// check status levels
describe("Status levels", async function(){
  it("will return the correct status levels", async function(){
    const signers = await ethers.getSigners();

    const tvkprestigeFactory = await ethers.getContractFactory(
        'TVKPrestige'
    );

    const tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige;

    await tvkPrestige.deployed()

    const levels = await tvkPrestige.levels()

    const copper = ethers.BigNumber.from(0)
    const bronze = ethers.BigNumber.from('1000' + eighteenZeros)
    const silver = ethers.BigNumber.from('5000' + eighteenZeros)
    const gold = ethers.BigNumber.from('10000' + eighteenZeros)
    const platinum = ethers.BigNumber.from('25000' + eighteenZeros)

    expect(levels[0]).to.equal(copper);
    expect(levels[1]).to.equal(bronze);
    expect(levels[2]).to.equal(silver);
    expect(levels[3]).to.equal(gold);
    expect(levels[4]).to.equal(platinum);

  });
});

describe("Account status", async function(){
  it("will return copper status if none has been set for account", async function(){
    const signers = await ethers.getSigners();

    const tvkprestigeFactory = await ethers.getContractFactory(
        'TVKPrestige'
    );

    const tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige;

    await tvkPrestige.deployed()

    const status = await tvkPrestige.status(signers[0].address);
    expect(status).to.equal(0);
  });

  it("will change the status of an account", async function(){
    const signers = await ethers.getSigners();

    const tvkprestigeFactory = await ethers.getContractFactory(
        'TVKPrestige'
    );

    const tvkPrestige = await tvkprestigeFactory.deploy() as TVKPrestige;

    await tvkPrestige.deployed()

    tvkPrestige.set_status(signers[0].address, 1);
    const status = await tvkPrestige.status(signers[0].address);

    expect(status).to.equal(1);
  });
});

// accept valid status
// don't accept invalid status
// take ownership of TVK equal to levels difference
// emit correct status in event
//
