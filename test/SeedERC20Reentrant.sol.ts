import * as Util from "./Util";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { SeedERC20Reentrant } from "../typechain/SeedERC20Reentrant";
import type { SeedERC20 } from "../typechain/SeedERC20";

chai.use(solidity);
const { expect, assert } = chai;

describe("SeedERC20", async function () {
  it("should guard against reentrancy when seeding if primary reserve is malicious", async function () {
    const signers = await ethers.getSigners();
    const bob = signers[1];
    const carol = signers[2];
    const dave = signers[3];

    const maliciousReserve = (await Util.basicDeploy(
      "SeedERC20Reentrant",
      {}
    )) as SeedERC20Reentrant;

    const bobReserve = maliciousReserve.connect(bob);

    const seedPrice = 100;
    const seedUnits = 100;
    const unseedDelay = 0;

    const bobUnits = 1;

    const seedERC20Factory = await ethers.getContractFactory("SeedERC20");
    const seedERC20 = (await seedERC20Factory.deploy({
      reserve: maliciousReserve.address,
      recipient: dave.address,
      seedPrice: seedPrice,
      seedUnits: seedUnits,
      unseedDelay: unseedDelay,
      name: "seed",
      symbol: "SD",
    })) as SeedERC20;

    await maliciousReserve.addReentrantTarget(seedERC20.address);

    const bobSeed = seedERC20.connect(bob);

    await maliciousReserve.transfer(bob.address, bobUnits * seedPrice);

    // Bob just wants to seed 1 unit.

    await bobReserve.approve(seedERC20.address, bobUnits * seedPrice);
    await Util.assertError(
      async () => await bobSeed.seed(bobUnits),
      "revert ReentrancyGuard: reentrant call",
      "did not guard against reentancy attack"
    );
  });
});
