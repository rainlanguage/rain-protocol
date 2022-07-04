import { assert } from "chai";
import { defaultAbiCoder } from "ethers/lib/utils";
import { artifacts, ethers } from "hardhat";
import type {
  FactoryChildTest,
  InitializeEvent,
} from "../../../typechain/FactoryChildTest";
import type {
  CurationConfigStruct,
  FactoryCurator,
  RegisterCurationEvent,
} from "../../../typechain/FactoryCurator";
import type { FactoryTest } from "../../../typechain/FactoryTest";
import { ReadWriteTier } from "../../../typechain/ReadWriteTier";
import { ReserveToken } from "../../../typechain/ReserveToken";
import { sixZeros } from "../../../utils/constants/bigNumber";
import { basicDeploy } from "../../../utils/deploy/basic";
import { getEventArgs } from "../../../utils/events";
import { assertError } from "../../../utils/test/assertError";
import { Tier } from "../../../utils/types/tier";

describe("FactoryCurator createChild", async function () {
  it("should revert if user does not meet tier requirement", async () => {
    const signers = await ethers.getSigners();

    const curator = signers[1];
    const signer1 = signers[2];

    const FEE = 100 + sixZeros;

    const factoryTest = (await basicDeploy("FactoryTest", {})) as FactoryTest;

    const reserve = (await basicDeploy("ReserveToken", {})) as ReserveToken;

    await reserve.transfer(signer1.address, FEE);

    const readWriteTier = (await basicDeploy(
      "ReadWriteTier",
      {}
    )) as ReadWriteTier;

    const factoryCurator = (await basicDeploy(
      "FactoryCurator",
      {}
    )) as FactoryCurator;

    const config: CurationConfigStruct = {
      factory: factoryTest.address,
      curator: curator.address,
      feeConfig: {
        token: reserve.address,
        amount: FEE,
      },
      tierConfig: {
        tierContract: readWriteTier.address,
        minimumTier: Tier.FOUR,
        context: [],
      },
    };

    const txRegisterConfig = await factoryCurator.registerConfig(config);

    const { id: id_, config: config_ } = (await getEventArgs(
      txRegisterConfig,
      "RegisterCuration",
      factoryCurator
    )) as RegisterCurationEvent["args"];

    const childValue = 123;

    await reserve.connect(signer1).approve(factoryCurator.address, FEE);

    // await readWriteTier.setTier(signer1.address, Tier.FOUR, []);

    await assertError(
      async () =>
        await factoryCurator
          .connect(signer1)
          .createChild(
            id_,
            config_,
            defaultAbiCoder.encode(["uint256"], [childValue])
          ),
      "MINIMUM_TIER",
      "did not revert when user failed to meet tier requirement"
    );
  });

  it("should revert if config has not been registered", async () => {
    const signers = await ethers.getSigners();

    const curator = signers[1];
    const signer1 = signers[2];
    const wrongCurator = signers[3];

    const FEE = 100 + sixZeros;

    const factoryTest = (await basicDeploy("FactoryTest", {})) as FactoryTest;

    const reserve = (await basicDeploy("ReserveToken", {})) as ReserveToken;

    await reserve.transfer(signer1.address, FEE);

    const readWriteTier = (await basicDeploy(
      "ReadWriteTier",
      {}
    )) as ReadWriteTier;

    const factoryCurator = (await basicDeploy(
      "FactoryCurator",
      {}
    )) as FactoryCurator;

    const config: CurationConfigStruct = {
      factory: factoryTest.address,
      curator: curator.address,
      feeConfig: {
        token: reserve.address,
        amount: FEE,
      },
      tierConfig: {
        tierContract: readWriteTier.address,
        minimumTier: Tier.FOUR,
        context: [],
      },
    };

    const txRegisterConfig = await factoryCurator.registerConfig(config);

    const { id: id_, config: config_ } = (await getEventArgs(
      txRegisterConfig,
      "RegisterCuration",
      factoryCurator
    )) as RegisterCurationEvent["args"];

    const childValue = 123;

    await reserve.connect(signer1).approve(factoryCurator.address, FEE);

    await readWriteTier.setTier(signer1.address, Tier.FOUR, []);

    await assertError(
      async () =>
        await factoryCurator.connect(signer1).createChild(
          id_.add(1), // id doesn't exist
          config_,
          defaultAbiCoder.encode(["uint256"], [childValue])
        ),
      "NOT_IN_REGISTRY",
      "did not revert when given bad id"
    );

    await assertError(
      async () =>
        await factoryCurator.connect(signer1).createChild(
          id_,
          { ...config_, curator: wrongCurator.address }, // unregistered config
          defaultAbiCoder.encode(["uint256"], [childValue])
        ),
      "NOT_IN_REGISTRY",
      "did not revert when given unregistered config"
    );
  });

  it("should create a child using a registered config", async () => {
    const signers = await ethers.getSigners();

    const curator = signers[1];
    const signer1 = signers[2];

    const FEE = 100 + sixZeros;

    const factoryTest = (await basicDeploy("FactoryTest", {})) as FactoryTest;

    const reserve = (await basicDeploy("ReserveToken", {})) as ReserveToken;

    await reserve.transfer(signer1.address, FEE);

    const readWriteTier = (await basicDeploy(
      "ReadWriteTier",
      {}
    )) as ReadWriteTier;

    const factoryCurator = (await basicDeploy(
      "FactoryCurator",
      {}
    )) as FactoryCurator;

    const config: CurationConfigStruct = {
      factory: factoryTest.address,
      curator: curator.address,
      feeConfig: {
        token: reserve.address,
        amount: FEE,
      },
      tierConfig: {
        tierContract: readWriteTier.address,
        minimumTier: Tier.FOUR,
        context: [],
      },
    };

    const txRegisterConfig = await factoryCurator.registerConfig(config);

    const { id: id_, config: config_ } = (await getEventArgs(
      txRegisterConfig,
      "RegisterCuration",
      factoryCurator
    )) as RegisterCurationEvent["args"];

    const childValue = 123;

    await reserve.connect(signer1).approve(factoryCurator.address, FEE);

    await readWriteTier.setTier(signer1.address, Tier.FOUR, []);

    const txCreateChild = await factoryCurator
      .connect(signer1)
      .createChild(
        id_,
        config_,
        defaultAbiCoder.encode(["uint256"], [childValue])
      );

    const factoryChildTest = new ethers.Contract(
      ethers.utils.hexZeroPad(
        ethers.utils.hexStripZeros(
          (await getEventArgs(txCreateChild, "NewChild", factoryTest)).child
        ),
        20
      ),
      (await artifacts.readArtifact("FactoryChildTest")).abi
    ) as FactoryChildTest;

    const { sender: sender_, value: value_ } = (await getEventArgs(
      txCreateChild,
      "Initialize",
      factoryChildTest
    )) as InitializeEvent["args"];

    assert(
      sender_ === factoryTest.address,
      "wrong sender in factory child test InitializeEvent"
    );
    assert(
      value_.eq(childValue),
      "wrong value in factory child test InitializeEvent"
    );
  });
});
