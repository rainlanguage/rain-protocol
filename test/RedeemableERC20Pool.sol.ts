import * as Util from "./Util";
import chai, { util } from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { ReserveToken } from "../typechain/ReserveToken";
import type { RedeemableERC20Pool } from "../typechain/RedeemableERC20Pool";
import type { RedeemableERC20 } from "../typechain/RedeemableERC20";
import type { Prestige } from "../typechain/Prestige";

chai.use(solidity);
const { expect, assert } = chai;

enum Phase {
  ZERO,
  ONE,
  TWO,
  THREE,
  FOUR,
  FIVE,
  SIX,
  SEVEN,
  EIGHT,
}

const trustJson = require("../artifacts/contracts/Trust.sol/Trust.json");
const poolJson = require("../artifacts/contracts/RedeemableERC20Pool.sol/RedeemableERC20Pool.json");
const reserveJson = require("../artifacts/contracts/test/ReserveToken.sol/ReserveToken.json");
const redeemableTokenJson = require("../artifacts/contracts/RedeemableERC20.sol/RedeemableERC20.json");

describe("RedeemableERC20Pool", async function () {
  it("should safely poke weights after minimum trade duration", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const prestigeFactory = await ethers.getContractFactory("Prestige");
    const prestige = (await prestigeFactory.deploy()) as Prestige;
    const minimumStatus = 0;

    const redeemableFactory = await ethers.getContractFactory(
      "RedeemableERC20"
    );

    const reserveInit = ethers.BigNumber.from("5000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("5000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "20000" + Util.eighteenZeros
    );
    const minRaise = ethers.BigNumber.from("5000" + Util.sixZeros);

    const initialValuation = ethers.BigNumber.from("100000" + Util.sixZeros);
    // Same logic used by trust.
    const finalValuation = minRaise.add(redeemInit);

    const tokenName = "RedeemableERC20";
    const tokenSymbol = "RDX";

    const firstBlock = await ethers.provider.getBlockNumber();
    const nextPhaseBlock = firstBlock + 10;

    const redeemable = (await redeemableFactory.deploy({
      name: tokenName,
      symbol: tokenSymbol,
      reserve: reserve.address,
      prestige: prestige.address,
      minimumStatus: minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20;

    await redeemable.deployed();

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool", {
      libraries: {
        RightsManager: rightsManager.address,
      },
    });

    const pool = (await poolFactory.deploy({
      crpFactory: crpFactory.address,
      balancerFactory: bFactory.address,
      token: redeemable.address,
      reserve: reserve.address,
      reserveInit: reserveInit,
      initialValuation: initialValuation,
      finalValuation: finalValuation,
    })) as RedeemableERC20Pool;

    await pool.deployed();

    // Trust normally does this internally.
    await redeemable.transfer(pool.address, await redeemable.totalSupply());

    await reserve.transfer(pool.address, reserveInit);
    await redeemable.approve(pool.address, totalTokenSupply);

    await pool.ownerStartDutchAuction(nextPhaseBlock, {
      gasLimit: 10000000,
    });

    const expectedStartBlock = await ethers.provider.getBlockNumber();
    const expectedEndBlock = nextPhaseBlock + 1;

    let [crp, bPool] = await Util.poolContracts(signers, pool);

    const actualStartBlock = await pool.phaseBlocks(0);
    const actualEndBlock = await pool.phaseBlocks(1);

    assert(
      expectedStartBlock === actualStartBlock,
      `wrong start block from pool.phaseBlocks
      expected ${expectedStartBlock} got ${actualStartBlock}`
    );

    assert(
      expectedEndBlock === actualEndBlock,
      `wrong end block from pool.phaseBlocks
      expected ${expectedEndBlock} got ${actualEndBlock}`
    );

    while ((await ethers.provider.getBlockNumber()) <= nextPhaseBlock + 2) {
      await crp.pokeWeights();

      const actualStartBlock = await pool.phaseBlocks(0);
      const actualEndBlock = await pool.phaseBlocks(1);

      assert(
        actualStartBlock === expectedStartBlock,
        `wrong start block from pool.phaseBlocks after pokeWeights
        expected ${expectedStartBlock} got ${actualStartBlock}
        current block ${await ethers.provider.getBlockNumber()}
        final auction block ${nextPhaseBlock}`
      );

      assert(
        expectedEndBlock === actualEndBlock,
        `wrong end block from pool.phaseBlocks after pokeWeights
        expected ${expectedEndBlock} got ${actualEndBlock}`
      );
    }
  });

  it("should expose correct final weight", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const prestigeFactory = await ethers.getContractFactory("Prestige");
    const prestige = (await prestigeFactory.deploy()) as Prestige;
    const minimumStatus = 0;

    const redeemableFactory = await ethers.getContractFactory(
      "RedeemableERC20"
    );

    const reserveInit = ethers.BigNumber.from("50000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("50000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "200000" + Util.eighteenZeros
    );
    const minRaise = ethers.BigNumber.from("50000" + Util.sixZeros);

    const initialValuation = ethers.BigNumber.from("1000000" + Util.sixZeros);
    // Same logic used by trust.
    const finalValuation = minRaise.add(redeemInit);

    const tokenName = "RedeemableERC20";
    const tokenSymbol = "RDX";

    const redeemable = (await redeemableFactory.deploy({
      name: tokenName,
      symbol: tokenSymbol,
      reserve: reserve.address,
      prestige: prestige.address,
      minimumStatus: minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20;

    await redeemable.deployed();

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool", {
      libraries: {
        RightsManager: rightsManager.address,
      },
    });

    const pool = (await poolFactory.deploy({
      crpFactory: crpFactory.address,
      balancerFactory: bFactory.address,
      token: redeemable.address,
      reserve: reserve.address,
      reserveInit: reserveInit,
      initialValuation: initialValuation,
      finalValuation: finalValuation,
    })) as RedeemableERC20Pool;

    await pool.deployed();

    const finalWeight = await pool.finalWeight();

    assert(
      finalWeight.eq(finalValuation.mul(Util.ONE).div(reserveInit)),
      `final weight should equal finalValuation / totalSupply with no trading
            expected    ${finalValuation.mul(Util.ONE).div(reserveInit)}
            got         ${finalWeight}`
    );
  });

  it("should transfer all raised funds to owner on pool exit", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const prestigeFactory = await ethers.getContractFactory("Prestige");
    const prestige = (await prestigeFactory.deploy()) as Prestige;
    const minimumStatus = 0;

    const redeemableFactory = await ethers.getContractFactory(
      "RedeemableERC20"
    );

    const reserveInit = ethers.BigNumber.from("50000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("50000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "200000" + Util.eighteenZeros
    );
    const minRaise = ethers.BigNumber.from("50000" + Util.sixZeros);

    const initialValuation = ethers.BigNumber.from("1000000" + Util.sixZeros);
    // Same logic used by trust.
    const finalValuation = minRaise.add(redeemInit);

    const tokenName = "RedeemableERC20";
    const tokenSymbol = "RDX";

    const now = await ethers.provider.getBlockNumber();
    const raiseEndBlock = now + 50;

    const redeemable = (await redeemableFactory.deploy({
      name: tokenName,
      symbol: tokenSymbol,
      reserve: reserve.address,
      prestige: prestige.address,
      minimumStatus: minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20;

    await redeemable.deployed();

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool", {
      libraries: {
        RightsManager: rightsManager.address,
      },
    });

    const pool = (await poolFactory.deploy({
      crpFactory: crpFactory.address,
      balancerFactory: bFactory.address,
      token: redeemable.address,
      reserve: reserve.address,
      reserveInit: reserveInit,
      initialValuation: initialValuation,
      finalValuation: finalValuation,
    })) as RedeemableERC20Pool;

    await pool.deployed();

    // Trust normally does this internally.
    await redeemable.transfer(pool.address, await redeemable.totalSupply());

    await reserve.transfer(pool.address, reserveInit);
    await redeemable.approve(pool.address, totalTokenSupply);

    assert(
      (await pool.currentPhase()) === Phase.ZERO,
      `expected phase ${Phase.ZERO} but got ${await pool.currentPhase()}`
    );

    await pool.ownerStartDutchAuction(raiseEndBlock, {
      gasLimit: 10000000,
    });

    // move to phase ONE immediately
    assert(
      (await pool.currentPhase()) === Phase.ONE,
      `expected phase ${Phase.ONE} but got ${await pool.currentPhase()}`
    );

    // // The trust would do this internally but we need to do it here to test.
    let [crp, bPool] = await Util.poolContracts(signers, pool);

    await redeemable.ownerAddReceiver(crp.address);
    await redeemable.ownerAddSender(crp.address);
    await redeemable.ownerAddReceiver(bFactory.address);
    await redeemable.ownerAddReceiver(pool.address);

    // raise some funds
    const swapReserveForTokens = async (hodler, spend) => {
      // give hodler some reserve
      await reserve.transfer(hodler.address, spend);

      const reserveHodler = reserve.connect(hodler);
      const crpHodler = crp.connect(hodler);
      const bPoolHodler = bPool.connect(hodler);

      await crpHodler.pokeWeights();
      await reserveHodler.approve(bPool.address, spend);
      await bPoolHodler.swapExactAmountIn(
        reserve.address,
        spend,
        redeemable.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const reserveSpend = finalValuation.div(10); // 10% of target raise amount
    await swapReserveForTokens(signers[3], reserveSpend);

    // create a few blocks by sending some tokens around
    while ((await ethers.provider.getBlockNumber()) < raiseEndBlock + 1) {
      await reserve.transfer(signers[1].address, 1);
    }

    // moves to phase TWO 1 block after trading finishes
    assert(
      (await pool.currentPhase()) === Phase.TWO,
      `expected phase ${Phase.TWO} but got ${await pool.currentPhase()}`
    );

    const bPoolReserveBeforeExit = await reserve.balanceOf(bPool.address);
    const ownerReserveBeforeExit = await reserve.balanceOf(signers[0].address);

    await pool.ownerEndDutchAuction();

    // moves to phase THREE immediately when ending raise
    assert(
      (await pool.currentPhase()) === Phase.THREE,
      `expected phase ${Phase.THREE} but got ${await pool.currentPhase()}`
    );

    const bPoolReserveAfterExit = await reserve.balanceOf(bPool.address);
    const ownerReserveAfterExit = await reserve.balanceOf(signers[0].address);

    const reserveDust = Util.estimateReserveDust(bPoolReserveBeforeExit).add(
      1 // rounding error
    );

    assert(
      bPoolReserveAfterExit.eq(reserveDust),
      `wrong reserve left in balancer pool
            actual      ${bPoolReserveAfterExit}
            expected    ${reserveDust}
        `
    );

    assert(
      ownerReserveAfterExit.eq(
        ownerReserveBeforeExit.add(bPoolReserveBeforeExit.sub(reserveDust))
      ),
      `wrong owner reserve balance
            actual      ${ownerReserveAfterExit}
            expected    ${ownerReserveBeforeExit.add(
              bPoolReserveBeforeExit.sub(reserveDust)
            )}
        `
    );
  });

  it("should only allow owner to set pool phases and start raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const prestigeFactory = await ethers.getContractFactory("Prestige");
    const prestige = (await prestigeFactory.deploy()) as Prestige;
    const minimumStatus = 0;

    const redeemableFactory = await ethers.getContractFactory(
      "RedeemableERC20"
    );

    const reserveInit = ethers.BigNumber.from("50000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("50000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "200000" + Util.eighteenZeros
    );
    const minRaise = ethers.BigNumber.from("50000" + Util.sixZeros);

    const initialValuation = ethers.BigNumber.from("1000000" + Util.sixZeros);
    // Same logic used by trust.
    const finalValuation = minRaise.add(redeemInit);

    const tokenName = "RedeemableERC20";
    const tokenSymbol = "RDX";

    const now = await ethers.provider.getBlockNumber();
    const raiseEndBlock = now + 50;

    const redeemable = (await redeemableFactory.deploy({
      name: tokenName,
      symbol: tokenSymbol,
      reserve: reserve.address,
      prestige: prestige.address,
      minimumStatus: minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20;

    await redeemable.deployed();

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool", {
      libraries: {
        RightsManager: rightsManager.address,
      },
    });

    const pool = (await poolFactory.deploy({
      crpFactory: crpFactory.address,
      balancerFactory: bFactory.address,
      token: redeemable.address,
      reserve: reserve.address,
      reserveInit: reserveInit,
      initialValuation: initialValuation,
      finalValuation: finalValuation,
    })) as RedeemableERC20Pool;

    await pool.deployed();

    const pool1 = pool.connect(signers[1]);

    // Before init

    await Util.assertError(
      async () => await pool.ownerEndDutchAuction(),
      "revert BAD_PHASE",
      "owner was wrongly able to exit pool before trading was started"
    );

    // Init pool

    // Send all tokens to the pool immediately.
    // When the seed funds are raised, will build a pool from these.
    // Trust normally does this internally.
    await redeemable.transfer(pool.address, await redeemable.totalSupply());

    const reserve1 = new ethers.Contract(
      reserve.address,
      reserve.interface,
      signers[1]
    );

    await reserve.transfer(signers[1].address, reserveInit);

    await reserve1.transfer(pool.address, reserveInit);

    await Util.assertError(
      async () =>
        await pool1.ownerStartDutchAuction(raiseEndBlock, {
          gasLimit: 10000000,
        }),
      "revert Ownable: caller is not the owner",
      "non-owner was wrongly able to start pool trading"
    );

    await reserve.approve(pool.address, reserveInit);

    await pool.ownerStartDutchAuction(raiseEndBlock, { gasLimit: 10000000 });

    await reserve.approve(pool.address, reserveInit);

    await Util.assertError(
      async () =>
        await pool.ownerStartDutchAuction(raiseEndBlock, {
          gasLimit: 10000000,
        }),
      "revert BAD_PHASE",
      "pool trading wrongly initialized twice by owner"
    );

    // Exit pool

    // The trust would do this internally but we need to do it here to test.
    const crp = await pool.crp();
    await redeemable.ownerAddSender(crp);
    await redeemable.ownerAddReceiver(crp);
    await redeemable.ownerAddReceiver(bFactory.address);
    await redeemable.ownerAddReceiver(pool.address);

    // Before raiseEndBlock
    await Util.assertError(
      async () => await pool.ownerEndDutchAuction(),
      "revert BAD_PHASE",
      "owner was wrongly able to exit pool before raiseEndBlock"
    );

    // create a few blocks by sending some tokens around
    while ((await ethers.provider.getBlockNumber()) < raiseEndBlock - 1) {
      await reserve.transfer(signers[2].address, 1);
    }

    await Util.assertError(
      async () => await pool1.ownerEndDutchAuction(),
      "revert Ownable: caller is not the owner",
      "non-owner was wrongly able to end pool trading directly"
    );

    await pool.ownerEndDutchAuction();
  });

  it("should construct a pool with whitelisting", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const prestigeFactory = await ethers.getContractFactory("Prestige");
    const prestige = (await prestigeFactory.deploy()) as Prestige;
    const minimumStatus = 0;

    const redeemableFactory = await ethers.getContractFactory(
      "RedeemableERC20"
    );

    const reserveInit = ethers.BigNumber.from("50000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("50000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "200000" + Util.eighteenZeros
    );
    const minRaise = ethers.BigNumber.from("50000" + Util.sixZeros);

    const initialValuation = ethers.BigNumber.from("1000000" + Util.sixZeros);
    // Same logic used by trust.
    const finalValuation = minRaise.add(redeemInit);

    const expectedRights = [false, false, true, false, true, false];

    // The final valuation of redeemable should be 100 000 as this is the redemption value.
    // Reserve init has value of 50 000 so ratio is 2:1.
    const expectedFinalWeight = ethers.BigNumber.from("2" + Util.sixZeros);

    const tokenName = "RedeemableERC20";
    const tokenSymbol = "RDX";

    const now = await ethers.provider.getBlockNumber();
    const phaseOneBlock = now + 15;

    const redeemable = (await redeemableFactory.deploy({
      name: tokenName,
      symbol: tokenSymbol,
      reserve: reserve.address,
      prestige: prestige.address,
      minimumStatus: minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20;

    await redeemable.deployed();

    assert(
      (await reserve.balanceOf(redeemable.address)).eq(0),
      "reserve was not 0 on redeemable construction"
    );
    assert(
      (await redeemable.totalSupply()).eq(totalTokenSupply),
      `total supply was not ${totalTokenSupply} on redeemable construction`
    );
    assert(
      (await redeemable.currentPhase()) === Phase.ZERO,
      `current phase was not ${
        Phase.ZERO
      } on construction, got ${await redeemable.currentPhase()}`
    );

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool", {
      libraries: {
        RightsManager: rightsManager.address,
      },
    });

    const pool = (await poolFactory.deploy({
      crpFactory: crpFactory.address,
      balancerFactory: bFactory.address,
      token: redeemable.address,
      reserve: reserve.address,
      reserveInit: reserveInit,
      initialValuation: initialValuation,
      finalValuation: finalValuation,
    })) as RedeemableERC20Pool;

    await pool.deployed();

    // Trust normally does this internally.
    await redeemable.transfer(pool.address, await redeemable.totalSupply());

    assert((await pool.token()) === redeemable.address, "wrong token address");
    assert((await pool.owner()) === signers[0].address, "wrong owner");
    assert(
      (await pool.owner()) === (await redeemable.owner()),
      "mismatch owner"
    );

    await reserve.transfer(pool.address, reserveInit);
    await redeemable.approve(pool.address, totalTokenSupply);

    await pool.ownerStartDutchAuction(phaseOneBlock, {
      gasLimit: 10000000,
    });

    let [crp, bPool] = await Util.poolContracts(signers, pool);

    const actualRights = await crp.rights();

    expectedRights.forEach((expectedRight, i) => {
      assert(
        actualRights[i] === expectedRight,
        `wrong right ${i} ${expectedRight} ${actualRights[i]}`
      );
    });

    // whitelisted LPs
    await Util.assertError(
      async () => await crp.joinPool(1, []),
      "revert ERR_NOT_ON_WHITELIST",
      "non-whitelisted signer wrongly joined pool"
    );

    // The trust would do this internally but we need to do it here to test.
    await redeemable.ownerAddSender(crp.address);
    await redeemable.ownerAddReceiver(crp.address);
    await redeemable.ownerAddReceiver(bFactory.address);
    await redeemable.ownerAddReceiver(pool.address);

    await Util.assertError(
      async () => await pool.ownerEndDutchAuction(),
      "revert BAD_PHASE",
      "failed to error on early exit"
    );

    // create a few blocks by sending some tokens around
    while ((await ethers.provider.getBlockNumber()) <= phaseOneBlock) {
      await reserve.transfer(signers[1].address, 1);
    }

    await pool.ownerEndDutchAuction();
  });

  it("should construct pool and exit with 0 minimum raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const prestigeFactory = await ethers.getContractFactory("Prestige");
    const prestige = (await prestigeFactory.deploy()) as Prestige;
    const minimumStatus = 0;

    const redeemableFactory = await ethers.getContractFactory(
      "RedeemableERC20"
    );

    const reserveInit = ethers.BigNumber.from("50000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("50000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "200000" + Util.eighteenZeros
    );
    const minRaise = ethers.BigNumber.from("0" + Util.sixZeros);

    const initialValuation = ethers.BigNumber.from("1000000" + Util.sixZeros);
    // Same logic used by trust.
    const finalValuation = minRaise.add(redeemInit);

    const tokenName = "RedeemableERC20";
    const tokenSymbol = "RDX";

    const now = await ethers.provider.getBlockNumber();
    const phaseOneBlock = now + 15;

    const redeemable = (await redeemableFactory.deploy({
      name: tokenName,
      symbol: tokenSymbol,
      prestige: prestige.address,
      minimumStatus: minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20;

    await redeemable.deployed();

    assert(
      (await reserve.balanceOf(redeemable.address)).eq(0),
      "reserve was not 0 on redeemable construction"
    );
    assert(
      (await redeemable.totalSupply()).eq(totalTokenSupply),
      `total supply was not ${totalTokenSupply} on redeemable construction`
    );
    assert(
      (await redeemable.currentPhase()) === Phase.ZERO,
      `current phase was not ${
        Phase.ZERO
      } on construction, got ${await redeemable.currentPhase()}`
    );

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool", {
      libraries: {
        RightsManager: rightsManager.address,
      },
    });

    const pool = (await poolFactory.deploy({
      crpFactory: crpFactory.address,
      balancerFactory: bFactory.address,
      token: redeemable.address,
      reserve: reserve.address,
      reserveInit: reserveInit,
      initialValuation: initialValuation,
      finalValuation: finalValuation,
    })) as RedeemableERC20Pool;

    await pool.deployed();

    // Trust normally does this internally.
    await redeemable.transfer(pool.address, await redeemable.totalSupply());

    assert((await pool.token()) === redeemable.address, "wrong token address");
    assert((await pool.owner()) === signers[0].address, "wrong owner");
    assert(
      (await pool.owner()) === (await redeemable.owner()),
      "mismatch owner"
    );

    await reserve.transfer(pool.address, reserveInit);
    await redeemable.approve(pool.address, totalTokenSupply);

    await pool.ownerStartDutchAuction(phaseOneBlock, {
      gasLimit: 10000000,
    });

    // The trust would do this internally but we need to do it here to test.
    let [crp, bPool] = await Util.poolContracts(signers, pool);
    await redeemable.ownerAddSender(crp.address);
    await redeemable.ownerAddReceiver(crp.address);
    await redeemable.ownerAddReceiver(bFactory.address);
    await redeemable.ownerAddReceiver(pool.address);

    await Util.assertError(
      async () => await pool.ownerEndDutchAuction(),
      "revert BAD_PHASE",
      "failed to error on early exit"
    );

    // create a few blocks by sending some tokens around
    while ((await ethers.provider.getBlockNumber()) <= phaseOneBlock) {
      await reserve.transfer(signers[1].address, 1);
    }

    await pool.ownerEndDutchAuction();
  });

  it("should fail to construct pool if initial reserve amount is zero", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const prestigeFactory = await ethers.getContractFactory("Prestige");
    const prestige = (await prestigeFactory.deploy()) as Prestige;
    const minimumStatus = 0;

    const redeemableFactory = await ethers.getContractFactory(
      "RedeemableERC20"
    );

    const reserveInit = ethers.BigNumber.from("0" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("50000" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "200000" + Util.eighteenZeros
    );
    const minRaise = ethers.BigNumber.from("50000" + Util.sixZeros);

    const initialValuation = ethers.BigNumber.from("1000000" + Util.sixZeros);
    // Same logic used by trust.
    const finalValuation = minRaise.add(redeemInit);

    const tokenName = "RedeemableERC20";
    const tokenSymbol = "RDX";

    const redeemable = (await redeemableFactory.deploy({
      name: tokenName,
      symbol: tokenSymbol,
      prestige: prestige.address,
      minimumStatus: minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20;

    await redeemable.deployed();

    assert(
      (await reserve.balanceOf(redeemable.address)).eq(0),
      "reserve was not 0 on redeemable construction"
    );
    assert(
      (await redeemable.totalSupply()).eq(totalTokenSupply),
      `total supply was not ${totalTokenSupply} on redeemable construction`
    );
    assert(
      (await redeemable.currentPhase()) === Phase.ZERO,
      `current phase was not ${
        Phase.ZERO
      } on construction, got ${await redeemable.currentPhase()}`
    );

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool", {
      libraries: {
        RightsManager: rightsManager.address,
      },
    });

    await Util.assertError(
      async () => {
        const pool = (await poolFactory.deploy({
          crpFactory: crpFactory.address,
          balancerFactory: bFactory.address,
          token: redeemable.address,
          reserve: reserve.address,
          reserveInit: reserveInit,
          initialValuation: initialValuation,
          finalValuation: finalValuation,
        })) as RedeemableERC20Pool;
        await pool.deployed();
      },
      "revert RESERVE_INIT_MINIMUM",
      "failed to error when reserve init below minimum at construction"
    );
  });

  it("should fail to construct pool if initial redeemable amount is zero", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [rightsManager, crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken;

    const prestigeFactory = await ethers.getContractFactory("Prestige");
    const prestige = (await prestigeFactory.deploy()) as Prestige;
    const minimumStatus = 0;

    const redeemableFactory = await ethers.getContractFactory(
      "RedeemableERC20"
    );

    const reserveInit = ethers.BigNumber.from("50000" + Util.sixZeros);
    const redeemInit = ethers.BigNumber.from("0" + Util.sixZeros);
    const totalTokenSupply = ethers.BigNumber.from(
      "200000" + Util.eighteenZeros
    );
    const minRaise = ethers.BigNumber.from("50000" + Util.sixZeros);

    const initialValuation = ethers.BigNumber.from("1000000" + Util.sixZeros);
    // Same logic used by trust.
    const finalValuation = minRaise.add(redeemInit);

    const tokenName = "RedeemableERC20";
    const tokenSymbol = "RDX";

    const now = await ethers.provider.getBlockNumber();
    const phaseOneBlock = now + 15;

    const redeemable = (await redeemableFactory.deploy({
      name: tokenName,
      symbol: tokenSymbol,
      prestige: prestige.address,
      minimumStatus: minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20;

    await redeemable.deployed();

    assert(
      (await reserve.balanceOf(redeemable.address)).eq(0),
      "reserve was not 0 on redeemable construction"
    );
    assert(
      (await redeemable.totalSupply()).eq(totalTokenSupply),
      `total supply was not ${totalTokenSupply} on redeemable construction`
    );
    assert(
      (await redeemable.currentPhase()) === Phase.ZERO,
      `current phase was not ${
        Phase.ZERO
      } on construction, got ${await redeemable.currentPhase()}`
    );

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool", {
      libraries: {
        RightsManager: rightsManager.address,
      },
    });

    (await poolFactory.deploy({
      crpFactory: crpFactory.address,
      balancerFactory: bFactory.address,
      token: redeemable.address,
      reserve: reserve.address,
      reserveInit: reserveInit,
      initialValuation: initialValuation,
      finalValuation: finalValuation,
    })) as RedeemableERC20Pool;
  });
});
