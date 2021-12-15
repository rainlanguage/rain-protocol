import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers, artifacts } from "hardhat";
import type { ReserveToken } from "../../typechain/ReserveToken";
import type { RedeemableERC20Pool } from "../../typechain/RedeemableERC20Pool";
import type { RedeemableERC20 } from "../../typechain/RedeemableERC20";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { IBPool } from "../../typechain/IBPool";
import type { Contract } from "ethers";

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

enum Tier {
  NIL,
  COPPER,
  BRONZE,
  SILVER,
  GOLD,
  PLATINUM,
  DIAMOND,
  CHAD,
  JAWAD,
}

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

describe("RedeemableERC20Pool", async function () {
  it("should construct with minimum raise duration of 1", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

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

    const erc20Config = { name: "RedeemableERC20", symbol: "RDX" };

    const minimumTradingDuration = 1;

    const redeemable = (await redeemableFactory.deploy({
      admin: signers[0].address,
      erc20Config,
      reserve: reserve.address,
      tier: tier.address,
      minimumStatus: minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20 & Contract;

    await redeemable.deployed();

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool");

    const pool = (await poolFactory.deploy({
      crpFactory: crpFactory.address,
      balancerFactory: bFactory.address,
      token: redeemable.address,
      reserve: reserve.address,
      reserveInit: reserveInit,
      initialValuation: initialValuation,
      finalValuation: finalValuation,
      minimumTradingDuration,
    })) as RedeemableERC20Pool & Contract;

    await pool.deployed();

    // Trust normally does this internally.
    await redeemable.grantRole(
      await redeemable.DEFAULT_ADMIN_ROLE(),
      pool.address
    );

    // The trust would do this internally but we need to do it here to test.
    const [crp] = await Util.poolContracts(signers, pool);
    await redeemable.grantRole(await redeemable.SENDER(), crp.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), crp.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), bFactory.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), pool.address);

    await redeemable.transfer(pool.address, await redeemable.totalSupply());

    await reserve.transfer(pool.address, reserveInit);
    await redeemable.approve(pool.address, totalTokenSupply);

    await pool.startDutchAuction({
      gasLimit: 10000000,
    });
  });
  it("should revert construction with minimum trading duration of 0", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

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

    const erc20Config = { name: "RedeemableERC20", symbol: "RDX" };

    const minimumTradingDuration = 0;

    const redeemable = (await redeemableFactory.deploy({
      admin: signers[0].address,
      erc20Config,
      reserve: reserve.address,
      tier: tier.address,
      minimumStatus: minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20 & Contract;

    await redeemable.deployed();

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool");

    await Util.assertError(
      async () =>
        (await poolFactory.deploy({
          crpFactory: crpFactory.address,
          balancerFactory: bFactory.address,
          token: redeemable.address,
          reserve: reserve.address,
          reserveInit: reserveInit,
          initialValuation: initialValuation,
          finalValuation: finalValuation,
          minimumTradingDuration,
        })) as RedeemableERC20Pool & Contract,
      "0_TRADING_DURATION",
      "wrongly constructed pool with 0 minimum trading duration"
    );
  });

  it("should safely poke weights after minimum trading duration", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

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

    const erc20Config = { name: "RedeemableERC20", symbol: "RDX" };

    const minimumTradingDuration = 10;

    const redeemable = (await redeemableFactory.deploy({
      admin: signers[0].address,
      erc20Config,
      reserve: reserve.address,
      tier: tier.address,
      minimumStatus: minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20 & Contract;

    await redeemable.deployed();

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool");

    const pool = (await poolFactory.deploy({
      crpFactory: crpFactory.address,
      balancerFactory: bFactory.address,
      token: redeemable.address,
      reserve: reserve.address,
      reserveInit: reserveInit,
      initialValuation: initialValuation,
      finalValuation: finalValuation,
      minimumTradingDuration,
    })) as RedeemableERC20Pool & Contract;

    await pool.deployed();

    // Trust normally does this internally.
    await redeemable.grantRole(
      await redeemable.DEFAULT_ADMIN_ROLE(),
      pool.address
    );

    // The trust would do this internally but we need to do it here to test.
    const [crp] = await Util.poolContracts(signers, pool);
    await redeemable.grantRole(await redeemable.SENDER(), crp.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), crp.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), bFactory.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), pool.address);

    await redeemable.transfer(pool.address, await redeemable.totalSupply());

    await reserve.transfer(pool.address, reserveInit);
    await redeemable.approve(pool.address, totalTokenSupply);

    const expectedPhaseOneBlock = (await ethers.provider.getBlockNumber()) + 1;
    const expectedPhaseTwoBlock =
      expectedPhaseOneBlock + minimumTradingDuration + 1;

    await pool.startDutchAuction({
      gasLimit: 10000000,
    });

    const actualPhaseOneBlock = await pool.phaseBlocks(0);
    const actualPhaseTwoBlock = await pool.phaseBlocks(1);

    assert(
      expectedPhaseOneBlock === actualPhaseOneBlock,
      `wrong start block from pool.phaseBlocks
      expected ${expectedPhaseOneBlock} got ${actualPhaseOneBlock}`
    );

    assert(
      expectedPhaseTwoBlock === actualPhaseTwoBlock,
      `wrong end block from pool.phaseBlocks
        expected ${expectedPhaseTwoBlock} got ${actualPhaseTwoBlock}`
    );

    while (
      (await ethers.provider.getBlockNumber()) <=
      expectedPhaseTwoBlock + 2
    ) {
      await crp.pokeWeights();

      const actualStartBlock = await pool.phaseBlocks(0);
      const actualEndBlock = await pool.phaseBlocks(1);

      assert(
        actualStartBlock === expectedPhaseOneBlock,
        `wrong start block from pool.phaseBlocks after pokeWeights
        expected ${expectedPhaseOneBlock} got ${actualStartBlock}
        current block ${await ethers.provider.getBlockNumber()}
        final auction block ${expectedPhaseTwoBlock}`
      );

      assert(
        expectedPhaseTwoBlock === actualEndBlock,
        `wrong end block from pool.phaseBlocks after pokeWeights
        expected ${expectedPhaseTwoBlock} got ${actualEndBlock}`
      );
    }
  });

  it("should expose correct final weight", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

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

    const erc20Config = { name: "RedeemableERC20", symbol: "RDX" };

    const minimumTradingDuration = 10;

    const redeemable = (await redeemableFactory.deploy({
      admin: signers[0].address,
      erc20Config,
      reserve: reserve.address,
      tier: tier.address,
      minimumStatus: minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20 & Contract;

    await redeemable.deployed();

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool");

    const pool = (await poolFactory.deploy({
      crpFactory: crpFactory.address,
      balancerFactory: bFactory.address,
      token: redeemable.address,
      reserve: reserve.address,
      reserveInit: reserveInit,
      initialValuation: initialValuation,
      finalValuation: finalValuation,
      minimumTradingDuration,
    })) as RedeemableERC20Pool & Contract;

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

    const admin = signers[0];
    const signer1 = signers[1];
    const signer2 = signers[2];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

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

    const erc20Config = { name: "RedeemableERC20", symbol: "RDX" };

    const minimumTradingDuration = 50;

    await tier.setTier(signer1.address, Tier.GOLD, []);
    await tier.setTier(signer2.address, Tier.GOLD, []);

    const redeemable = (await redeemableFactory.deploy({
      admin: admin.address,
      erc20Config,
      reserve: reserve.address,
      tier: tier.address,
      minimumStatus: minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20 & Contract;

    await redeemable.deployed();

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool");

    const pool = (await poolFactory.deploy({
      crpFactory: crpFactory.address,
      balancerFactory: bFactory.address,
      token: redeemable.address,
      reserve: reserve.address,
      reserveInit: reserveInit,
      initialValuation: initialValuation,
      finalValuation: finalValuation,
      minimumTradingDuration,
    })) as RedeemableERC20Pool & Contract;

    await pool.deployed();

    // Trust normally does this internally.
    await redeemable.grantRole(
      await redeemable.DEFAULT_ADMIN_ROLE(),
      pool.address
    );

    // The trust would do this internally but we need to do it here to test.
    const [crp] = await Util.poolContracts(signers, pool);
    await redeemable.grantRole(await redeemable.SENDER(), crp.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), crp.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), bFactory.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), pool.address);

    await redeemable.transfer(pool.address, await redeemable.totalSupply());

    await reserve.transfer(pool.address, reserveInit);
    await redeemable.approve(pool.address, totalTokenSupply);

    assert(
      (await pool.currentPhase()) === Phase.ZERO,
      `expected phase ${Phase.ZERO} but got ${await pool.currentPhase()}`
    );

    await pool.startDutchAuction({
      gasLimit: 10000000,
    });

    const now = await ethers.provider.getBlockNumber();
    const raiseEndBlock = now + minimumTradingDuration;

    // move to phase ONE immediately
    assert(
      (await pool.currentPhase()) === Phase.ONE,
      `expected phase ${Phase.ONE} but got ${await pool.currentPhase()}`
    );

    const [, bPool] = await Util.poolContracts(signers, pool);

    // raise some funds
    const swapReserveForTokens = async (signer, spend) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend);

      const reserveSigner = reserve.connect(signer);
      const crpSigner = crp.connect(signer);
      const bPoolSigner = bPool.connect(signer);

      await crpSigner.pokeWeights();
      await reserveSigner.approve(bPool.address, spend);
      await bPoolSigner.swapExactAmountIn(
        reserve.address,
        spend,
        redeemable.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const reserveSpend = finalValuation.div(10); // 10% of target raise amount
    await swapReserveForTokens(signer1, reserveSpend);

    // create a few blocks by sending some tokens around
    while ((await ethers.provider.getBlockNumber()) < raiseEndBlock + 1) {
      await reserve.transfer(signer2.address, 1);
    }

    // moves to phase TWO 1 block after trading finishes
    assert(
      (await pool.currentPhase()) === Phase.TWO,
      `expected phase ${Phase.TWO} but got ${await pool.currentPhase()}`
    );

    const bPoolReserveBeforeExit = await reserve.balanceOf(bPool.address);
    const ownerReserveBeforeExit = await reserve.balanceOf(admin.address);

    await pool.ownerEndDutchAuction();

    // moves to phase THREE immediately when ending raise
    assert(
      (await pool.currentPhase()) === Phase.THREE,
      `expected phase ${Phase.THREE} but got ${await pool.currentPhase()}`
    );

    const bPoolReserveAfterExit = await reserve.balanceOf(bPool.address);
    const ownerReserveAfterExit = await reserve.balanceOf(admin.address);

    const reserveDust = Util.estimateReserveDust(bPoolReserveBeforeExit).add(
      2 // 1 left behind + 1 for rounding error
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

  it("should only allow owner to set pool phases, and anyone can start raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const admin = signers[0];
    const signer1 = signers[1];
    const signer2 = signers[2];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

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

    const erc20Config = { name: "RedeemableERC20", symbol: "RDX" };

    const minimumTradingDuration = 50;

    await tier.setTier(signer1.address, Tier.GOLD, []);
    await tier.setTier(signer2.address, Tier.GOLD, []);

    const redeemable = (await redeemableFactory.deploy({
      admin: admin.address,
      erc20Config,
      reserve: reserve.address,
      tier: tier.address,
      minimumStatus: minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20 & Contract;

    await redeemable.deployed();

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool");

    const pool = (await poolFactory.deploy({
      crpFactory: crpFactory.address,
      balancerFactory: bFactory.address,
      token: redeemable.address,
      reserve: reserve.address,
      reserveInit: reserveInit,
      initialValuation: initialValuation,
      finalValuation: finalValuation,
      minimumTradingDuration,
    })) as RedeemableERC20Pool & Contract;

    await pool.deployed();

    // Before init

    await Util.assertError(
      async () => await pool.ownerEndDutchAuction(),
      "BAD_PHASE",
      "owner was wrongly able to exit pool before trading was started"
    );

    // Init pool

    // Send all tokens to the pool immediately.
    // When the seed funds are raised, will build a pool from these.
    // Trust normally does this internally.
    await redeemable.grantRole(
      await redeemable.DEFAULT_ADMIN_ROLE(),
      pool.address
    );

    // The trust would do this internally but we need to do it here to test.
    const [crp] = await Util.poolContracts(signers, pool);
    await redeemable.grantRole(await redeemable.SENDER(), crp.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), crp.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), bFactory.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), pool.address);

    await redeemable.transfer(pool.address, await redeemable.totalSupply());

    await reserve.transfer(pool.address, reserveInit);
    await redeemable.approve(pool.address, totalTokenSupply);

    // non-owner able to start pool trading
    await pool.connect(signer1).startDutchAuction({
      gasLimit: 10000000,
    });

    const now = await ethers.provider.getBlockNumber();
    const raiseEndBlock = now + minimumTradingDuration;

    await Util.assertError(
      async () =>
        await pool.startDutchAuction({
          gasLimit: 10000000,
        }),
      "BAD_PHASE",
      "pool trading wrongly initialized twice by owner"
    );

    // Exit pool

    // Before raiseEndBlock
    await Util.assertError(
      async () => await pool.ownerEndDutchAuction(),
      "BAD_PHASE",
      "owner was wrongly able to exit pool before raiseEndBlock"
    );

    // create a few blocks by sending some tokens around
    while ((await ethers.provider.getBlockNumber()) < raiseEndBlock) {
      await reserve.transfer(signer2.address, 1);
    }

    await Util.assertError(
      async () => await pool.connect(signer1).ownerEndDutchAuction(),
      "Ownable: caller is not the owner",
      "non-owner was wrongly able to end pool trading directly"
    );

    await pool.ownerEndDutchAuction();
  });

  it("should correctly calculate exit balances if people grief balancer", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const dummy = signers[1];
    const owner = signers[3];
    const signer1 = signers[4];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
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
    const finalValuation = minRaise.add(redeemInit);

    const erc20Config = { name: "RedeemableERC20", symbol: "RDX" };

    const minimumTradingDuration = 15;

    const redeemable = (await redeemableFactory.deploy({
      admin: signers[0].address,
      erc20Config,
      reserve: reserve.address,
      tier: tier.address,
      minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20 & Contract;

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

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool");

    const pool = (await poolFactory.deploy({
      crpFactory: crpFactory.address,
      balancerFactory: bFactory.address,
      token: redeemable.address,
      reserve: reserve.address,
      reserveInit: reserveInit,
      initialValuation: initialValuation,
      finalValuation: finalValuation,
      minimumTradingDuration,
    })) as RedeemableERC20Pool & Contract;

    await pool.deployed();

    pool.transferOwnership(owner.address);

    // Trust normally does this internally.
    await redeemable.grantRole(
      await redeemable.DEFAULT_ADMIN_ROLE(),
      pool.address
    );
    await redeemable.transfer(pool.address, await redeemable.totalSupply());

    assert((await pool.token()) === redeemable.address, "wrong token address");
    assert((await pool.owner()) === owner.address, "wrong owner");

    await reserve.transfer(pool.address, reserveInit);
    await redeemable.approve(pool.address, totalTokenSupply);

    // send excess reserve before the auction starts.
    // random ppl could do this.
    await reserve.transfer(pool.address, "100000000");

    await pool.startDutchAuction({
      gasLimit: 10000000,
    });

    const now = await ethers.provider.getBlockNumber();
    const phaseOneBlock = now + minimumTradingDuration;

    const [crp, bPool] = await Util.poolContracts(signers, pool);

    // The trust would do this internally but we need to do it here to test.
    await redeemable.grantRole(await redeemable.SENDER(), crp.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), crp.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), bFactory.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), pool.address);

    await Util.assertError(
      async () => await pool.connect(owner).ownerEndDutchAuction(),
      "BAD_PHASE",
      "failed to error on early exit"
    );

    await reserve.transfer(dummy.address, 1);

    // raise some funds
    const swapReserveForTokens = async (signer, spend) => {
      // give signer some reserve
      await reserve.transfer(signer.address, spend);

      const reserveSigner = reserve.connect(signer);
      const crpSigner = crp.connect(signer);
      const bPoolSigner = bPool.connect(signer);

      await crpSigner.pokeWeights();
      await reserveSigner.approve(bPool.address, spend);
      await bPoolSigner.swapExactAmountIn(
        reserve.address,
        spend,
        redeemable.address,
        ethers.BigNumber.from("1"),
        ethers.BigNumber.from("1000000" + Util.sixZeros)
      );
    };

    const reserveSpend = "100000000";
    await swapReserveForTokens(signer1, reserveSpend);

    // send excess reserve to the bPool after the auction starts and gulp it.
    // random ppl could do this.
    await reserve.transfer(bPool.address, "100000000");
    await bPool.connect(signer1).gulp(reserve.address);
    // send signer1 tokens to the bPool after the auction starts and gulp it.
    // random ppl could do this.
    await redeemable
      .connect(signer1)
      .transfer(bPool.address, await redeemable.balanceOf(signer1.address));
    await bPool.connect(signer1).gulp(redeemable.address);

    // create a few blocks by sending some tokens around
    while ((await ethers.provider.getBlockNumber()) <= phaseOneBlock) {
      await reserve.transfer(dummy.address, 1);
    }

    await swapReserveForTokens(signer1, reserveSpend);

    // Send a bunch of reserve to the bPool that it won't have accounted for
    // in its internal records, because there is no gulp.
    await reserve.transfer(bPool.address, "100000000");
    // Send signer1 tokens to the bPool that it won't have accounted for
    // in its internal records, because there is no gulp.
    await redeemable
      .connect(signer1)
      .transfer(bPool.address, await redeemable.balanceOf(signer1.address));

    await swapReserveForTokens(signer1, reserveSpend);

    // send excess reserve to the pool after the auction starts.
    // random ppl could do this.
    await reserve.transfer(pool.address, "100000000");
    // send signer1 tokens to the pool after the auction starts.
    // random ppl could do this.
    await redeemable
      .connect(signer1)
      .transfer(pool.address, await redeemable.balanceOf(signer1.address));

    await pool.connect(owner).ownerEndDutchAuction();

    assert(
      // 4x grief reserves - 1000001 - 1 intentional dust + 3x reserveSpend from token purchases
      (await reserve.balanceOf(owner.address)).eq(
        ethers.BigNumber.from("50698999998")
      ),
      `wrong owner final reserve balance
      expected  50698999998
      got       ${await reserve.balanceOf(owner.address)}`
    );

    assert(
      (await redeemable.balanceOf(pool.address)).isZero(),
      `wrong pool final token balance, should've been burned
      expected  0
      got       ${await redeemable.balanceOf(pool.address)}`
    );
    assert(
      (await redeemable.totalSupply()).eq(
        (await redeemable.balanceOf(signer1.address)).add(
          await redeemable.balanceOf(bPool.address) // token dust
        )
      ),
      "wrong final redeemable token supply"
    );
  });

  it("should construct a pool with whitelisting", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const admin = signers[0];
    const signer1 = signers[1];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

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

    const erc20Config = { name: "RedeemableERC20", symbol: "RDX" };

    const minimumTradingDuration = 15;

    await tier.setTier(signer1.address, Tier.GOLD, []);

    const redeemable = (await redeemableFactory.deploy({
      admin: admin.address,
      erc20Config,
      reserve: reserve.address,
      tier: tier.address,
      minimumStatus: minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20 & Contract;

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

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool");

    const pool = (await poolFactory.deploy({
      crpFactory: crpFactory.address,
      balancerFactory: bFactory.address,
      token: redeemable.address,
      reserve: reserve.address,
      reserveInit: reserveInit,
      initialValuation: initialValuation,
      finalValuation: finalValuation,
      minimumTradingDuration,
    })) as RedeemableERC20Pool & Contract;

    await pool.deployed();

    // Trust normally does this internally.
    await redeemable.grantRole(
      await redeemable.DEFAULT_ADMIN_ROLE(),
      pool.address
    );

    // The trust would do this internally but we need to do it here to test.
    const [crp] = await Util.poolContracts(signers, pool);
    await redeemable.grantRole(await redeemable.SENDER(), crp.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), crp.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), bFactory.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), pool.address);

    await redeemable.transfer(pool.address, await redeemable.totalSupply());

    assert((await pool.token()) === redeemable.address, "wrong token address");
    assert((await pool.owner()) === admin.address, "wrong owner");
    assert(
      await redeemable.hasRole(
        await redeemable.DEFAULT_ADMIN_ROLE(),
        await pool.owner()
      ),
      "mismatch owner"
    );

    await reserve.transfer(pool.address, reserveInit);
    await redeemable.approve(pool.address, totalTokenSupply);

    await pool.startDutchAuction({
      gasLimit: 10000000,
    });

    const now = await ethers.provider.getBlockNumber();
    const phaseOneBlock = now + minimumTradingDuration;

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
      "ERR_NOT_ON_WHITELIST",
      "non-whitelisted signer wrongly joined pool"
    );

    // The trust would do this internally but we need to do it here to test.
    await redeemable.grantRole(await redeemable.SENDER(), crp.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), crp.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), bFactory.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), pool.address);

    await Util.assertError(
      async () => await pool.ownerEndDutchAuction(),
      "BAD_PHASE",
      "failed to error on early exit"
    );

    // create a few blocks by sending some tokens around
    while ((await ethers.provider.getBlockNumber()) <= phaseOneBlock) {
      await reserve.transfer(signer1.address, 1);
    }

    await pool.ownerEndDutchAuction();
  });

  it("should construct pool and exit with 0 minimum raise", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const admin = signers[0];
    const signer1 = signers[1];

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

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

    const erc20Config = { name: "RedeemableERC20", symbol: "RDX" };

    const minimumTradingDuration = 15;

    await tier.setTier(signer1.address, Tier.GOLD, []);

    const redeemable = (await redeemableFactory.deploy({
      admin: admin.address,
      erc20Config,
      tier: tier.address,
      minimumStatus: minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20 & Contract;

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

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool");

    const pool = (await poolFactory.deploy({
      crpFactory: crpFactory.address,
      balancerFactory: bFactory.address,
      token: redeemable.address,
      reserve: reserve.address,
      reserveInit: reserveInit,
      initialValuation: initialValuation,
      finalValuation: finalValuation,
      minimumTradingDuration,
    })) as RedeemableERC20Pool & Contract;

    await pool.deployed();

    // Trust normally does this internally.
    await redeemable.grantRole(
      await redeemable.DEFAULT_ADMIN_ROLE(),
      pool.address
    );

    // The trust would do this internally but we need to do it here to test.
    const [crp] = await Util.poolContracts(signers, pool);
    await redeemable.grantRole(await redeemable.SENDER(), crp.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), crp.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), bFactory.address);
    await redeemable.grantRole(await redeemable.RECEIVER(), pool.address);

    await redeemable.transfer(pool.address, await redeemable.totalSupply());

    assert((await pool.token()) === redeemable.address, "wrong token address");
    assert((await pool.owner()) === admin.address, "wrong owner");
    assert(
      await redeemable.hasRole(
        await redeemable.DEFAULT_ADMIN_ROLE(),
        await pool.owner()
      ),
      "mismatch owner"
    );

    await reserve.transfer(pool.address, reserveInit);
    await redeemable.approve(pool.address, totalTokenSupply);

    await pool.startDutchAuction({
      gasLimit: 10000000,
    });

    const now = await ethers.provider.getBlockNumber();
    const phaseOneBlock = now + minimumTradingDuration;

    await Util.assertError(
      async () => await pool.ownerEndDutchAuction(),
      "BAD_PHASE",
      "failed to error on early exit"
    );

    // create a few blocks by sending some tokens around
    while ((await ethers.provider.getBlockNumber()) <= phaseOneBlock) {
      await reserve.transfer(signer1.address, 1);
    }

    await pool.ownerEndDutchAuction();
  });

  it("should fail to construct pool if initial reserve amount is zero", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

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

    const erc20Config = { name: "RedeemableERC20", symbol: "RDX" };

    const minimumTradingDuration = 15;

    const redeemable = (await redeemableFactory.deploy({
      admin: signers[0].address,
      erc20Config,
      tier: tier.address,
      minimumStatus: minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20 & Contract;

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

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool");

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
          minimumTradingDuration,
        })) as RedeemableERC20Pool & Contract;
        await pool.deployed();
      },
      "RESERVE_INIT_MINIMUM",
      "failed to error when reserve init below minimum at construction"
    );
  });

  it("should fail to construct pool if initial redeemable amount is zero", async function () {
    this.timeout(0);

    const signers = await ethers.getSigners();

    const [crpFactory, bFactory] = await Util.balancerDeploy();

    const reserve = (await Util.basicDeploy(
      "ReserveToken",
      {}
    )) as ReserveToken & Contract;

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    const tier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    const minimumStatus = Tier.GOLD;

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

    const erc20Config = { name: "RedeemableERC20", symbol: "RDX" };

    const minimumTradingDuration = 15;

    const redeemable = (await redeemableFactory.deploy({
      admin: signers[0].address,
      erc20Config,
      tier: tier.address,
      minimumStatus: minimumStatus,
      totalSupply: totalTokenSupply,
    })) as RedeemableERC20 & Contract;

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

    const poolFactory = await ethers.getContractFactory("RedeemableERC20Pool");

    (await poolFactory.deploy({
      crpFactory: crpFactory.address,
      balancerFactory: bFactory.address,
      token: redeemable.address,
      reserve: reserve.address,
      reserveInit: reserveInit,
      initialValuation: initialValuation,
      finalValuation: finalValuation,
      minimumTradingDuration,
    })) as RedeemableERC20Pool & Contract;
  });
});
