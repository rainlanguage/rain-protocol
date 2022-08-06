import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert } from "chai";
import { ethers } from "hardhat";
import type { CooldownTest } from "../../typechain/CooldownTest";
import {
  assertError,
  getBlockTimestamp,
  getEventArgs,
  max_uint32,
  timewarp,
} from "../../utils";

describe("Cooldown modifier test", async function () {
  let cooldownTest: CooldownTest;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  beforeEach(async () => {
    const signers = await ethers.getSigners();
    alice = signers[0];
    bob = signers[1];
    const CooldownTestFactory = await ethers.getContractFactory("CooldownTest");
    cooldownTest = (await CooldownTestFactory.deploy()) as CooldownTest;
  });

  it("should set the cooldown for alice", async function () {
    const cooldownDuration = ethers.BigNumber.from(10); // 10 seconds
    const expectedValue = ethers.BigNumber.from(2);
    // Initialize
    await cooldownTest.initialize(cooldownDuration);
    // Setting value which sets the cooldown
    await cooldownTest.connect(alice).setValue(expectedValue);

    const value = await cooldownTest.getValue();

    assert(expectedValue.eq(value), "Wrong value set");

    // Setting the value again which should trigger the cooldown
    await assertError(
      async () =>
        await cooldownTest.connect(alice).setValue(expectedValue.add(1)),
      "COOLDOWN",
      "Cooldown not set"
    );
  });

  it("should set maximum cooldown", async function () {
    const cooldownDuration = ethers.BigNumber.from(max_uint32); // 10 seconds
    const expectedValue = ethers.BigNumber.from(2);
    // Initialize
    await cooldownTest.initialize(cooldownDuration);

    // Setting value which sets the cooldown
    const cooldownTx0 = await cooldownTest
      .connect(alice)
      .setValue(expectedValue);
    const expectedTimestamp0 =
      (await getBlockTimestamp()) + cooldownDuration.toNumber();

    const { caller: caller0, cooldown: cooldown0 } = await getEventArgs(
      cooldownTx0,
      "CooldownTriggered",
      cooldownTest
    );

    assert(caller0 == alice.address, `Invalid sender`);

    assert(
      cooldown0 == expectedTimestamp0,
      `Invalid cooldownDuration, ${cooldown0} does not match ${expectedTimestamp0}`
    );

    const value = await cooldownTest.getValue();

    assert(expectedValue.eq(value), "Wrong value set");

    // Setting the value again which should trigger the cooldown
    await assertError(
      async () =>
        await cooldownTest.connect(alice).setValue(expectedValue.add(1)),
      "COOLDOWN",
      "Cooldown not set"
    );

    // // Fast forwarding time
    // await timewarp(max_uint32.toNumber());
    // const expectedValue1 = ethers.BigNumber.from(15);

    // await cooldownTest.connect(alice).setValue(expectedValue1);

    // const value1 = await cooldownTest.getValue();

    // assert(expectedValue1.eq(value1), "Wrong value set");
  });

  it("should set the cooldown for alice and bob", async function () {
    const cooldownDuration = ethers.BigNumber.from(10); // 10 seconds
    const expectedValue = ethers.BigNumber.from(2);
    // Initialize
    await cooldownTest.initialize(cooldownDuration);
    // Setting value which sets the cooldown : alice
    await cooldownTest.connect(alice).setValue(expectedValue);

    const value = await cooldownTest.getValue();

    assert(expectedValue.eq(value), "Wrong value set");

    // Setting value which sets the cooldown : bob
    await cooldownTest.connect(bob).setValue(expectedValue.add(10));

    await assertError(
      async () =>
        await cooldownTest.connect(alice).setValue(expectedValue.add(1)),
      "COOLDOWN",
      "Cooldown not set"
    );

    await assertError(
      async () =>
        await cooldownTest.connect(bob).setValue(expectedValue.add(1)),
      "COOLDOWN",
      "Cooldown not set"
    );
  });

  it("should clear the cooldown once the cooldown period surpasses", async function () {
    const cooldownDuration = ethers.BigNumber.from(10); // 10 seconds
    const expectedValue0 = ethers.BigNumber.from(2);
    // Initialize
    await cooldownTest.initialize(cooldownDuration);
    // Setting value which sets the cooldown : alice
    await cooldownTest.connect(alice).setValue(expectedValue0);

    const value0 = await cooldownTest.getValue();

    assert(expectedValue0.eq(value0), "Wrong value set");

    await assertError(
      async () =>
        await cooldownTest.connect(alice).setValue(expectedValue0.add(1)),
      "COOLDOWN",
      "Cooldown not set"
    );

    // Fast forwarding time
    await timewarp(10);
    const expectedValue1 = ethers.BigNumber.from(15);

    await cooldownTest.connect(alice).setValue(expectedValue1);

    const value1 = await cooldownTest.getValue();

    assert(expectedValue1.eq(value1), "Wrong value set");
  });

  it("should clear the cooldown for multiple users", async function () {
    const cooldownDuration = ethers.BigNumber.from(10); // 10 seconds
    const expectedValue0 = ethers.BigNumber.from(2);

    await cooldownTest.initialize(cooldownDuration);

    // Alice
    await cooldownTest.connect(alice).setValue(expectedValue0);
    const value0 = await cooldownTest.getValue();
    assert(expectedValue0.eq(value0), "Wrong value set");

    // Bob
    await cooldownTest.connect(bob).setValue(expectedValue0.add(10));
    const value1 = await cooldownTest.getValue();
    assert(expectedValue0.add(10).eq(value1), "Wrong value set");

    // Asserting Cooldowm
    await assertError(
      async () =>
        await cooldownTest.connect(alice).setValue(expectedValue0.add(1)),
      "COOLDOWN",
      "Cooldown not set"
    );
    await assertError(
      async () =>
        await cooldownTest.connect(bob).setValue(expectedValue0.add(1)),
      "COOLDOWN",
      "Cooldown not set"
    );

    // Fast forwarding time
    await timewarp(10);
    const expectedValue1 = ethers.BigNumber.from(15);

    // Alice
    await cooldownTest.connect(alice).setValue(expectedValue1);
    const value2 = await cooldownTest.getValue();
    assert(expectedValue1.eq(value2), "Wrong value set");

    // Bob
    await cooldownTest.connect(bob).setValue(expectedValue1);
    const value3 = await cooldownTest.getValue();
    assert(expectedValue1.eq(value3), "Wrong value set");
  });

  it("should emit an event for alice once a cooldown is triggered", async function () {
    const cooldownDuration_ = ethers.BigNumber.from(10); // 10 seconds
    const expectedValue0 = ethers.BigNumber.from(2);

    // Initialize
    await cooldownTest.initialize(cooldownDuration_);
    // Setting value which sets the cooldown : alice
    const cooldownTx0 = await cooldownTest
      .connect(alice)
      .setValue(expectedValue0);
    const expectedTimestamp0 =
      (await getBlockTimestamp()) + cooldownDuration_.toNumber();

    const { caller: caller0, cooldown: cooldown0 } = await getEventArgs(
      cooldownTx0,
      "CooldownTriggered",
      cooldownTest
    );

    assert(caller0 == alice.address, `Invalid sender`);

    assert(
      cooldown0 == expectedTimestamp0,
      `Invalid cooldownDuration, ${cooldown0} does not match ${expectedTimestamp0}`
    );

    await assertError(
      async () =>
        await cooldownTest.connect(alice).setValue(expectedValue0.add(1)),
      "COOLDOWN",
      "Cooldown not set"
    );

    // Fast forwarding time
    await timewarp(10);
    const expectedValue1 = ethers.BigNumber.from(15);

    const cooldownTx1 = await cooldownTest
      .connect(alice)
      .setValue(expectedValue1);
    const expectedTimestamp1 =
      (await getBlockTimestamp()) + cooldownDuration_.toNumber();

    const { caller: caller1, cooldown: cooldown1 } = await getEventArgs(
      cooldownTx1,
      "CooldownTriggered",
      cooldownTest
    );

    assert(caller1 == alice.address, `Invalid sender`);

    assert(
      cooldown1 == expectedTimestamp1,
      `Invalid cooldownDuration, ${cooldown1} does not match ${expectedTimestamp1}`
    );
  });

  it("should emit an event for alice & bob once a cooldown is triggered", async function () {
    const cooldownDuration_ = ethers.BigNumber.from(10); // 10 seconds
    const expectedValue0 = ethers.BigNumber.from(2);

    // Initialize
    await cooldownTest.initialize(cooldownDuration_);

    // Setting value which sets the cooldown : alice
    const cooldownTx0 = await cooldownTest
      .connect(alice)
      .setValue(expectedValue0);
    const expectedTimestamp0 =
      (await getBlockTimestamp()) + cooldownDuration_.toNumber();

    const { caller: caller0, cooldown: cooldown0 } = await getEventArgs(
      cooldownTx0,
      "CooldownTriggered",
      cooldownTest
    );

    assert(caller0 == alice.address, `Invalid sender`);

    assert(
      cooldown0 == expectedTimestamp0,
      `Invalid cooldownDuration, ${cooldown0} does not match ${expectedTimestamp0}`
    );

    await assertError(
      async () =>
        await cooldownTest.connect(alice).setValue(expectedValue0.add(1)),
      "COOLDOWN",
      "Cooldown not set"
    );

    // Setting value which sets the cooldown : alice
    const cooldownTx1 = await cooldownTest
      .connect(bob)
      .setValue(expectedValue0);
    const expectedTimestamp1 =
      (await getBlockTimestamp()) + cooldownDuration_.toNumber();

    const { caller: caller1, cooldown: cooldown1 } = await getEventArgs(
      cooldownTx1,
      "CooldownTriggered",
      cooldownTest
    );

    assert(caller1 == bob.address, `Invalid sender`);

    assert(
      cooldown1 == expectedTimestamp1,
      `Invalid cooldownDuration, ${cooldown1} does not match ${expectedTimestamp1}`
    );

    await assertError(
      async () =>
        await cooldownTest.connect(bob).setValue(expectedValue0.add(1)),
      "COOLDOWN",
      "Cooldown not set"
    );
  });
});
