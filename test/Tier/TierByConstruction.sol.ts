import chai from "chai";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { TierByConstructionTest } from "../../typechain/TierByConstructionTest";
import type { TierByConstructionClaimTest } from "../../typechain/TierByConstructionClaimTest";
import { assertError, getEventArgs } from "../Util";
import type { Contract, ContractFactory } from "ethers";
import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

chai.use(solidity);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { expect, assert } = chai;

describe("TierByConstruction", async function () {
  let alice: SignerWithAddress;
  let owner: SignerWithAddress;
  let tierByConstructionFactory: ContractFactory;
  let readWriteTier: ReadWriteTier & Contract;
  let tierByConstruction: TierByConstructionTest;
  let tierByConstructionInitializeArgs;

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();
    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    readWriteTier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    await readWriteTier.deployed();

    // Need to set the tier before construction.
    readWriteTier.setTier(alice.address, 1, []);

    tierByConstructionFactory = await ethers.getContractFactory(
      "TierByConstructionTest"
    );

    tierByConstruction = (await tierByConstructionFactory.deploy(
      readWriteTier.address
    )) as TierByConstructionTest & Contract;
    await tierByConstruction.deployed();

    tierByConstructionInitializeArgs = await getEventArgs(
      tierByConstruction.deployTransaction,
      "TierByConstructionInitialize",
      tierByConstruction
    );
  });

  it("should enforce the account has held the tier according to isTier, as a modifier", async () => {
    assert(await tierByConstruction.ifZero());

    await assertError(
      async () => await tierByConstruction.ifOne(),
      "MINIMUM_TIER",
      "onlyTier modifier did not restrict access to ifOne function which should have failed minimum tier requirement"
    );
  });

  it("should return true only if the account has held the minimum tier continuously since the construction block until the current tier report ", async () => {
    assert(await tierByConstruction.isTier(owner.address, 0));
  });

  it("should return the parameters entered in the constructor", async function () {
    const now = await ethers.provider.getBlockNumber();
    const constructionBlock =
      tierByConstructionInitializeArgs.constructionBlockNumber;

    assert(constructionBlock.eq(now));

    assert(
      readWriteTier.address ===
        (await tierByConstructionInitializeArgs.tierContract)
    );
  });

  it("should return false if isTier is queried with a wrong tier than the current tier", async function () {
    assert(!(await tierByConstruction.isTier(owner.address, 4)));
  });

  it("should be able to use unlimited access functions in any tier", async function () {
    assert(await tierByConstruction.isTier(owner.address, 0));

    await tierByConstruction.unlimited();
  });

  it("should enter a function restricted to Zero status if the tier has never been set", async function () {
    assert(await tierByConstruction.isTier(owner.address, 0));

    await tierByConstruction.ifZero();
  });

  it("should fail if you try to enter a function of a specific tier if it has never been set", async function () {
    assert(await tierByConstruction.isTier(owner.address, 0));

    await assertError(
      async () => await tierByConstruction.ifFour(),
      "MINIMUM_TIER",
      "did not make a mistake when the user entered FOUR when he did not have it"
    );
  });

  it("shouldn't you set to use a function of the new tier after construction", async function () {
    await readWriteTier.setTier(owner.address, 1, []);

    await tierByConstruction.unlimited();

    await tierByConstruction.ifZero();

    // Setting the status AFTER construction doesn't help.
    await assertError(
      async () => await tierByConstruction.ifOne(),
      "MINIMUM_TIER",
      "did not make a mistake when the user upgraded the ONE after construction"
    );
  });

  it("should be able to use unlimited functions and lower tier than the upgraded one", async function () {
    const tierByConstruction = (await tierByConstructionFactory.deploy(
      readWriteTier.address
    )) as TierByConstructionTest & Contract;
    await tierByConstruction.deployed();

    const tierByConstructionAlice = tierByConstruction.connect(alice.address);

    await tierByConstructionAlice.unlimited();

    await tierByConstructionAlice.ifZero();

    await tierByConstructionAlice.ifOne();
  });

  it("should not be able to use a function for a tier if you do not have that tier", async function () {
    await assertError(
      async () => await tierByConstruction.ifTwo(),
      "MINIMUM_TIER",
      "did not make a mistake when the user entered TWO when he did not have it."
    );
  });

  it("should be possible to use all functions restricted to the lower tier of the highest status", async function () {
    await readWriteTier.setTier(owner.address, 8, []);

    tierByConstruction = (await tierByConstructionFactory.deploy(
      readWriteTier.address
    )) as TierByConstructionTest & Contract;

    await tierByConstruction.deployed();

    await tierByConstruction.unlimited();

    await tierByConstruction.ifZero();

    await tierByConstruction.ifOne();

    await tierByConstruction.ifTwo();

    await tierByConstruction.ifEight();
  });

  it("should enter the functions of the previous tier when downgrading after construction", async function () {
    await readWriteTier.setTier(owner.address, 6, []);

    tierByConstruction = (await tierByConstructionFactory.deploy(
      readWriteTier.address
    )) as TierByConstructionTest & Contract;
    await tierByConstruction.deployed();

    await tierByConstruction.unlimited();

    await tierByConstruction.ifZero();

    await tierByConstruction.ifOne();

    await tierByConstruction.ifTwo();

    await tierByConstruction.ifSix();
  });

  it("Should not enter the functions of the former state when downgrading after construction", async function () {
    await readWriteTier.setTier(owner.address, 3, []);

    tierByConstruction = (await tierByConstructionFactory.deploy(
      readWriteTier.address
    )) as TierByConstructionTest & Contract;
    await tierByConstruction.deployed();

    await tierByConstruction.unlimited();

    await tierByConstruction.ifZero();

    await tierByConstruction.ifOne();

    await assertError(
      async () => await tierByConstruction.ifSix(),
      "MINIMUM_TIER",
      "did not make a mistake when the user entered dimond when he did not have it."
    );
  });
});

describe("TierByConstructionClaim", async function () {
  let owner: SignerWithAddress;
  let readWriteTier: ReadWriteTier & Contract;
  let tierByConstructionClaim: TierByConstructionClaimTest & Contract;
  let tierByConstructionClaimFactory: ContractFactory;

  before(async () => {
    [owner] = await ethers.getSigners();

    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    readWriteTier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    await readWriteTier.deployed();

    tierByConstructionClaimFactory = await ethers.getContractFactory(
      "TierByConstructionClaimTest"
    );
    tierByConstructionClaim = (await tierByConstructionClaimFactory.deploy(
      readWriteTier.address
    )) as TierByConstructionClaimTest & Contract;
    await tierByConstructionClaim.deployed();
  });

  it("shouldn't you set to use a function of the new tier after construction", async function () {
    await readWriteTier.setTier(owner.address, 4, []);

    await assertError(
      async () => await tierByConstructionClaim.claim(owner.address, []),
      "MINIMUM_TIER",
      "did not make a mistake when the user upgraded the FOUR after construction"
    );
  });

  it("should enter the function and mint 100 tokens if the owner has tier 4", async function () {
    tierByConstructionClaim = (await tierByConstructionClaimFactory.deploy(
      readWriteTier.address
    )) as TierByConstructionClaimTest & Contract;
    await tierByConstructionClaim.deployed();

    await tierByConstructionClaim.claim(owner.address, []);

    assert(
      Number(await tierByConstructionClaim.balanceOf(owner.address)) === 100,
      "did not enter correctly to the function"
    );
  });

  it("should not allow multiple minting", async function () {
    await assertError(
      async () => await tierByConstructionClaim.claim(owner.address, []),
      "DUPLICATE_CLAIM",
      "function does not correctly restrict multiple mints"
    );
  });
});
