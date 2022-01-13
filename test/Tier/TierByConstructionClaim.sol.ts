import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import { solidity } from "ethereum-waffle";
import type { Contract, ContractFactory } from "ethers";
import { ethers } from "hardhat";
import type { ReadWriteTier } from "../../typechain/ReadWriteTier";
import type { TierByConstructionClaim } from "../../typechain/TierByConstructionClaim";
import type { TierByConstructionClaimTest } from "../../typechain/TierByConstructionClaimTest";
import { assertError, getEventArgs } from "../Util";

chai.use(solidity);
const { expect, assert } = chai;

enum Tier {
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

describe("TierByConstructionClaim", async function () {
  let alice: SignerWithAddress;
  let readWriteTier: ReadWriteTier & Contract;
  let tierByConstructionClaimFactory: ContractFactory;

  beforeEach(async () => {
    [, alice] = await ethers.getSigners();
    const tierFactory = await ethers.getContractFactory("ReadWriteTier");
    readWriteTier = (await tierFactory.deploy()) as ReadWriteTier & Contract;
    await readWriteTier.deployed();

    // Need to set the tier before construction.
    readWriteTier.setTier(alice.address, 1, []);

    tierByConstructionClaimFactory = await ethers.getContractFactory(
      "TierByConstructionClaim"
    );
  });

  it("should set tierContract and minimumTier on construction", async () => {
    const tierByConstructionClaim =
      (await tierByConstructionClaimFactory.deploy({
        tierContract: readWriteTier.address,
        minimumTier: Tier.FOUR,
      })) as TierByConstructionClaim & Contract;

    await tierByConstructionClaim.deployed();

    const initialBlock = await ethers.provider.getBlockNumber();

    const { tierContract, constructionBlockNumber } = await getEventArgs(
      tierByConstructionClaim.deployTransaction,
      "TierByConstructionInitialize",
      tierByConstructionClaim
    );

    assert(
      tierContract === readWriteTier.address,
      "wrong tierContract address set on construction"
    );

    assert(
      constructionBlockNumber.eq(initialBlock),
      "wrong constructionBlock set on construction"
    );
  });

  describe("Claim", async () => {
    describe("should require minimum tier as per TierByConstruction logic (tier held continuously since contract construction) - failure case", async () => {
      it("min tier after construction", async () => {
        const tierByConstructionClaim =
          (await tierByConstructionClaimFactory.deploy({
            tierContract: readWriteTier.address,
            minimumTier: Tier.FOUR,
          })) as TierByConstructionClaim & Contract;

        await tierByConstructionClaim.deployed();

        await readWriteTier
          .connect(alice)
          .setTier(alice.address, Tier.FOUR, []); // after construction

        await assertError(
          async () => await tierByConstructionClaim.claim(alice.address, []),
          "MINIMUM_TIER",
          "alice claimed despite not being at least tier FOUR since contract construction"
        );
      });

      it("min tier before construction", async () => {
        await readWriteTier
          .connect(alice)
          .setTier(alice.address, Tier.FOUR, []); // before construction

        const tierByConstructionClaim =
          (await tierByConstructionClaimFactory.deploy({
            tierContract: readWriteTier.address,
            minimumTier: Tier.FOUR,
          })) as TierByConstructionClaim & Contract;

        await tierByConstructionClaim.deployed();

        await tierByConstructionClaim.claim(alice.address, []);
      });

      it("greater than min tier before construction", async () => {
        await readWriteTier
          .connect(alice)
          .setTier(alice.address, Tier.FIVE, []); // before construction

        const tierByConstructionClaim =
          (await tierByConstructionClaimFactory.deploy({
            tierContract: readWriteTier.address,
            minimumTier: Tier.FOUR,
          })) as TierByConstructionClaim & Contract;

        await tierByConstructionClaim.deployed();

        await tierByConstructionClaim.claim(alice.address, []);
      });

      it("less than min tier before construction", async () => {
        await readWriteTier
          .connect(alice)
          .setTier(alice.address, Tier.THREE, []); // before construction

        const tierByConstructionClaim =
          (await tierByConstructionClaimFactory.deploy({
            tierContract: readWriteTier.address,
            minimumTier: Tier.FOUR,
          })) as TierByConstructionClaim & Contract;

        await tierByConstructionClaim.deployed();

        await assertError(
          async () => await tierByConstructionClaim.claim(alice.address, []),
          "MINIMUM_TIER",
          "alice claimed despite not being at least tier FOUR since contract construction"
        );
      });
    });

    it("should only allow accounts to claim once per contract", async () => {
      await readWriteTier.connect(alice).setTier(alice.address, Tier.FOUR, []); // before construction

      const tierByConstructionClaim =
        (await tierByConstructionClaimFactory.deploy({
          tierContract: readWriteTier.address,
          minimumTier: Tier.FOUR,
        })) as TierByConstructionClaim & Contract;

      await tierByConstructionClaim.deployed();

      await tierByConstructionClaim.claim(alice.address, []);

      await assertError(
        async () => await tierByConstructionClaim.claim(alice.address, []),
        "DUPLICATE_CLAIM",
        "alice wrongly claimed more than once"
      );
    });

    it("should call _afterClaim hook after claim", async () => {
      await readWriteTier.connect(alice).setTier(alice.address, Tier.FOUR, []); // before construction

      const tierByConstructionClaimTestFactory =
        await ethers.getContractFactory("TierByConstructionClaimTest");

      const tierByConstructionClaimTest =
        (await tierByConstructionClaimTestFactory.deploy(
          readWriteTier.address
        )) as TierByConstructionClaimTest & Contract;

      await tierByConstructionClaimTest.deployed();

      assert(
        (await tierByConstructionClaimTest.balanceOf(alice.address)).isZero(),
        "expected zero balance"
      );

      await tierByConstructionClaimTest.claim(alice.address, "0xff");

      assert(
        (await tierByConstructionClaimTest.balanceOf(alice.address)).eq(100),
        "expected balance of 100 (minted)"
      );
    });

    it("should emit Claim event when claim occurs", async () => {
      await readWriteTier.connect(alice).setTier(alice.address, Tier.FOUR, []); // before construction

      const tierByConstructionClaim =
        (await tierByConstructionClaimFactory.deploy({
          tierContract: readWriteTier.address,
          minimumTier: Tier.FOUR,
        })) as TierByConstructionClaim & Contract;

      await tierByConstructionClaim.deployed();

      const claimPromise = tierByConstructionClaim
        .connect(alice)
        .claim(alice.address, "0xff");

      await expect(claimPromise)
        .to.emit(tierByConstructionClaim, "Claim")
        .withArgs(alice.address, alice.address, "0xff");
    });
  });
});
