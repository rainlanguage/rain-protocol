import * as Util from "../Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { SeedERC20Reentrant } from "../../typechain/SeedERC20Reentrant";
import type { Contract } from "ethers";

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

describe("SeedERC20Reentrant", async function () {
  it("should guard against reentrancy when redeeming if primary reserve is malicious", async function () {
    const signers = await ethers.getSigners();
    const bob = signers[1];
    const dave = signers[3];

    const maliciousReserve = (await Util.basicDeploy(
      "SeedERC20Reentrant",
      {}
    )) as SeedERC20Reentrant & Contract;

    const bobReserve = maliciousReserve.connect(bob);
    const daveReserve = maliciousReserve.connect(dave);

    const seedPrice = 100;
    const seederUnits = 10;
    const cooldownDuration = 1;

    const bobUnits = seederUnits;

    const [seedERC20] = await Util.seedERC20Deploy(dave, {
      reserve: maliciousReserve.address,
      recipient: dave.address,
      seedPrice,
      cooldownDuration,
      erc20Config: {
        name: "SeedToken",
        symbol: "SDT",
        distributor: Util.zeroAddress,
        initialSupply: seederUnits,
      },
    });

    const bobSeed = seedERC20.connect(bob);

    await maliciousReserve.transfer(bob.address, bobUnits * seedPrice);

    // Bob fully seeds
    await bobReserve.approve(seedERC20.address, bobUnits * seedPrice);
    await bobSeed.seed(0, bobUnits);

    // Dave gets 10% extra reserve from somewhere.
    await maliciousReserve.transfer(
      dave.address,
      seedPrice * seederUnits * 0.1
    );

    // Dave sends reserve back to the seed contract.
    await daveReserve.transfer(
      seedERC20.address,
      await daveReserve.balanceOf(dave.address)
    );

    // setup reserve to reentrantly call `redeem` method in `_beforeTokenTransfer` hook
    await maliciousReserve.addReentrantTarget(seedERC20.address);
    await maliciousReserve.setMethodTarget(3);

    await Util.assertError(
      async () => await bobSeed.redeem(1, 0),
      "ERC20: burn amount exceeds balance",
      "did not guard against redeem reentrancy via immediate burning"
    );
  });

  it("should guard against reentrancy when seeding if primary reserve is malicious", async function () {
    const signers = await ethers.getSigners();
    const bob = signers[1];
    const dave = signers[3];

    const maliciousReserve = (await Util.basicDeploy(
      "SeedERC20Reentrant",
      {}
    )) as SeedERC20Reentrant & Contract;

    const bobReserve = maliciousReserve.connect(bob);

    const seedPrice = 100;
    const seederUnits = 10;
    const cooldownDuration = 1;

    const bobUnits = 1;

    const [seedERC20] = await Util.seedERC20Deploy(dave, {
      reserve: maliciousReserve.address,
      recipient: dave.address,
      seedPrice,
      cooldownDuration,
      erc20Config: {
        name: "SeedToken",
        symbol: "SDT",
        distributor: Util.zeroAddress,
        initialSupply: seederUnits,
      },
    });

    // setup reserve to reentrantly call `seed` method in `_beforeTokenTransfer` hook
    await maliciousReserve.addReentrantTarget(seedERC20.address);
    await maliciousReserve.setMethodTarget(1);

    const bobSeed = seedERC20.connect(bob);

    await maliciousReserve.transfer(bob.address, bobUnits * seedPrice);

    // Bob just wants to buy 1 unit, but reserve will reentrantly buy units
    await bobReserve.approve(seedERC20.address, bobUnits * seedPrice);
    await Util.assertError(
      async () => await bobSeed.seed(0, bobUnits),
      "COOLDOWN",
      "did not guard against seed reentrancy spam via cooldown modifier"
    );
  });

  it("should guard against reentrancy when unseeding if primary reserve is malicious", async function () {
    const signers = await ethers.getSigners();
    const bob = signers[1];
    const dave = signers[3];

    const maliciousReserve = (await Util.basicDeploy(
      "SeedERC20Reentrant",
      {}
    )) as SeedERC20Reentrant & Contract;

    const bobReserve = maliciousReserve.connect(bob);

    const seedPrice = 100;
    const seederUnits = 10;
    const cooldownDuration = 1;

    const bobUnits = 3;

    const [seedERC20] = await Util.seedERC20Deploy(dave, {
      reserve: maliciousReserve.address,
      recipient: dave.address,
      seedPrice,
      cooldownDuration,
      erc20Config: {
        name: "SeedToken",
        symbol: "SDT",
        distributor: Util.zeroAddress,
        initialSupply: seederUnits,
      },
    });

    const bobSeed = seedERC20.connect(bob);

    await maliciousReserve.transfer(bob.address, bobUnits * seedPrice);

    // Bob buys 1 seed unit
    await bobReserve.approve(seedERC20.address, bobUnits * seedPrice);
    await bobSeed.seed(0, bobUnits);
    assert(
      (await seedERC20.balanceOf(bob.address)).eq(bobUnits),
      `bob does not have ${bobUnits} seed units`
    );

    // setup reserve to reentrantly call `unseed` method in `_beforeTokenTransfer` hook
    await maliciousReserve.addReentrantTarget(seedERC20.address);
    await maliciousReserve.setMethodTarget(2);

    await Util.assertError(
      async () => await bobSeed.unseed(1),
      "COOLDOWN",
      "did not guard against unseed reentrancy spam via cooldown modifier"
    );
  });
});
