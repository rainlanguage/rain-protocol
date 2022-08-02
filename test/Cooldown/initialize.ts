import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { ethers } from "hardhat";
import type { CooldownTest } from "../../typechain/CooldownTest";
import {
  assertError,
  getEventArgs,
  max_uint32,
} from "../../utils";

describe.only("Cooldown initialize test", async function () {
  let cooldownTest: CooldownTest;
  let alice: SignerWithAddress;

  beforeEach(async () => {
    const signers = await ethers.getSigners();
    alice = signers[0];
    const CooldownTestFactory = await ethers.getContractFactory("CooldownTest");
    cooldownTest = (await CooldownTestFactory.deploy()) as CooldownTest;
  });

  it("should initialize the Cooldown contract", async function () {
    const cooldownDuration = ethers.BigNumber.from(10); // 10 seconds

    await cooldownTest.initialize(cooldownDuration);
    const setCooldownDuration = await cooldownTest.getCooldownDuration();

    assert(
      cooldownDuration.eq(setCooldownDuration),
      `Invalid cooldownDuration, ${setCooldownDuration} does not match ${cooldownDuration}`
    );
  });

  it("cooldownDuration must be 0 before initialization", async function () {
    const expectedCooldownDuration = ethers.BigNumber.from(0);
    const currentCooldownDuration = await cooldownTest.getCooldownDuration();

    assert(
      expectedCooldownDuration.eq(currentCooldownDuration),
      `Invalid cooldownDuration, ${currentCooldownDuration} does not match ${expectedCooldownDuration}`
    );
  });

  it("should only allow cooldownDuration to be greater than 0", async function () {
    // Setting negative cooldownDuration
    await assertError(
      async () => await cooldownTest.initialize(0),
      "COOLDOWN_0",
      "Cooldown below 0 was set"
    );

    // Setting positive cooldownDuration
    const cooldownDuration = ethers.BigNumber.from(10);

    await cooldownTest.initialize(cooldownDuration);
    const setCooldownDuration = await cooldownTest.getCooldownDuration();

    assert(
      cooldownDuration.eq(setCooldownDuration),
      `Invalid cooldownDuration, ${setCooldownDuration} does not match ${cooldownDuration}`
    );
  });

  it("should allow max cooldownDuration to be uint32 max", async function () {
    const expectedCooldownDuration = max_uint32;

    // Setting max cooldownDuration
    await assertError(
      async () => await cooldownTest.initialize(max_uint32.add(1)),
      "COOLDOWN_MAX",
      "Cooldown above max_uint32 was set"
    );

    await cooldownTest.initialize(expectedCooldownDuration);
    const setCooldownDuration = await cooldownTest.getCooldownDuration();

    assert(
      expectedCooldownDuration.eq(setCooldownDuration),
      `Invalid cooldownDuration, ${setCooldownDuration} does not match ${expectedCooldownDuration}`
    );
  });

  it("should emit CooldownInitialize event upon initialization", async function () {
    const cooldownDuration_ = ethers.BigNumber.from(10);

    const initializeTx = await cooldownTest.connect(alice).initialize(cooldownDuration_);
    const { sender, cooldownDuration } = await getEventArgs(
      initializeTx,
      "CooldownInitialize",
      cooldownTest
    );

    assert(sender == alice.address, `Invalid sender`);

    assert(
      cooldownDuration_.eq(cooldownDuration),
      `Invalid cooldownDuration, ${cooldownDuration} does not match ${cooldownDuration_}`
    );
  });

  it("should not allow to reinitialize cooldownDuration", async function () {
    const cooldownDuration_ = ethers.BigNumber.from(10);

    const initializeTx = await cooldownTest.initialize(cooldownDuration_);
    const { cooldownDuration } = await getEventArgs(
      initializeTx,
      "CooldownInitialize",
      cooldownTest
    );

    assert(
      cooldownDuration_.eq(cooldownDuration),
      `Invalid cooldownDuration, ${cooldownDuration} does not match ${cooldownDuration_}`
    );

    // Reinitializing cooldown
    await assertError(
      async () => await cooldownTest.initialize(cooldownDuration_),
      "Assertion error",
      "Cooldown was reinitialized"
    );
  });
});
